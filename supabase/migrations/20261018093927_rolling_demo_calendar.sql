/*
# Rolling demo calendar: ensure_demo_calendar()

1. New function `ensure_demo_calendar()`
   - Guarantees `day_capacity` rows for the demo business for "today" through
     the next 45 days, computed in the demo timezone (America/New_York).
   - Weekday/weekend values match the seed: 8 trays / 1440 prep minutes on
     Mon-Fri, 10 trays / 1800 prep minutes on Sat-Sun.
   - Guarantees every Saturday inside that window has the seeded baseline
     order bringing it to 8 of 10 trays (96 cupcakes @ $3.50 = $336, matching
     the existing seed pattern), so "40 cupcakes for Saturday" always shows
     alternatives during the judging period.
   - Idempotent: capacity rows use upsert on the (business_id, date) primary
     key and never overwrite existing values; baseline orders are inserted
     only when missing (checked by is_baseline + date), never duplicated.
   - Never touches visitor or owner orders: only inserts rows with
     is_baseline = true (and is_global = true, which is what makes the
     baseline count for everyone).

2. Wiring
   - `cleanup_demo()` now calls `ensure_demo_calendar()` first, so every
     cleanup pass rolls the calendar forward.
   - `check_capacity()` calls it at the start ONLY when the requested date
     has no capacity row (lazy repair), keeping the hot path fast.

3. Timezone
   - "Today" and "Saturday" logic all use demo TZ America/New_York via
     `(now() AT TIME ZONE 'America/New_York')::date`, so the calendar rolls
     at midnight bakery time regardless of server TZ.

4. Security
   - ensure_demo_calendar: service_role only (called from SECURITY DEFINER
     functions; never granted to anon/authenticated).
   - cleanup_demo / check_capacity remain SECURITY DEFINER with locked
     search_path as before. No RLS changes. No table changes.
*/

CREATE OR REPLACE FUNCTION ensure_demo_calendar()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz constant uuid := '00000000-0000-0000-0000-000000000001';
  v_feed constant uuid := '00000000-0000-0000-0000-00000000feed';
  v_today date;
  v_window_end date;
  v_caps integer;
  v_sats integer;
BEGIN
  v_today := (now() AT TIME ZONE 'America/New_York')::date;
  v_window_end := v_today + 44;

  -- Capacity rows for the next 45 days; upsert keeps existing values intact.
  INSERT INTO day_capacity (business_id, date, trays, prep_minutes)
  SELECT v_biz, d,
    CASE WHEN extract(dow from d) IN (0, 6) THEN 10 ELSE 8 END,
    CASE WHEN extract(dow from d) IN (0, 6) THEN 1800 ELSE 1440 END
  FROM generate_series(v_today, v_window_end, '1 day') AS d
  ON CONFLICT (business_id, date) DO NOTHING;
  GET DIAGNOSTICS v_caps = ROW_COUNT;

  -- Baseline Saturday orders (8 of 10 trays = 96 cupcakes) where missing.
  WITH sat AS (
    SELECT d
    FROM generate_series(v_today, v_window_end, '1 day') AS d
    WHERE extract(dow from d) = 6
  ),
  missing AS (
    SELECT d FROM sat
    WHERE NOT EXISTS (
      SELECT 1 FROM orders o
      WHERE o.business_id = v_biz AND o.date = sat.d AND o.is_baseline = true
    )
  ),
  ins AS (
    INSERT INTO orders (business_id, session_id, date, status, customer_name,
                        contact, total, paid, is_baseline, is_global, created_at)
    SELECT v_biz, v_feed, d, 'confirmed', NULL, '', 336.00, true, true, true,
           '2026-09-26 09:00:00+00'::timestamptz
    FROM missing
    RETURNING id, date
  )
  SELECT count(*) INTO v_sats FROM ins;

  -- Baseline lines for any baseline order without lines.
  INSERT INTO order_lines (order_id, item_id, units, unit_price)
  SELECT o.id, i.id, 96, 3.50
  FROM orders o
  CROSS JOIN (SELECT id FROM items WHERE business_id = v_biz AND name = 'Cupcakes') i
  WHERE o.business_id = v_biz
    AND o.is_baseline = true
    AND o.status = 'confirmed'
    AND NOT EXISTS (SELECT 1 FROM order_lines ol WHERE ol.order_id = o.id)
    AND extract(dow from o.date) = 6;

  RETURN jsonb_build_object(
    'today', v_today,
    'window_end', v_window_end,
    'capacity_rows_added', v_caps,
    'saturday_baselines_added', v_sats
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION ensure_demo_calendar() FROM anon, authenticated;

-- ============ cleanup_demo: roll the calendar each pass ============
CREATE OR REPLACE FUNCTION cleanup_demo()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expired integer;
  v_convs integer;
BEGIN
  PERFORM ensure_demo_calendar();

  DELETE FROM orders
  WHERE is_global = false AND created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  DELETE FROM conversations c
  WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.session_id = c.session_id)
  AND c.created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_convs = ROW_COUNT;

  DELETE FROM bw_rate_limits WHERE window_start < date_trunc('hour', now()) - interval '2 hours';

  RETURN jsonb_build_object('expired_orders', v_expired, 'conversations_removed', v_convs);
END;
$$;

-- ============ check_capacity: full body + lazy calendar repair ============
CREATE OR REPLACE FUNCTION check_capacity(
  p_business_id uuid,
  p_session_id uuid,
  p_date date,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_line jsonb;
  v_trays_used integer := 0;
  v_prep_used integer := 0;
  v_load_trays integer := 0;
  v_load_prep integer := 0;
  v_cap record;
  v_fits boolean;
  v_lead_hours integer := 0;
  v_earliest_ok date;
  v_alternatives jsonb := '[]'::jsonb;
  v_line_trays integer;
  GLOBAL_SENTINEL constant uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
BEGIN
  -- Lazy repair: only rolls the calendar when the requested date is uncovered.
  SELECT count(*) INTO v_cap FROM day_capacity
  WHERE business_id = p_business_id AND date = p_date;
  IF (v_cap.count = 0) THEN
    PERFORM ensure_demo_calendar();
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('error', 'lines must be a non-empty array');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF NOT v_line ? 'item_id' OR NOT v_line ? 'units' THEN
      RETURN jsonb_build_object('error', 'each line needs item_id and units');
    END IF;
    IF jsonb_typeof(v_line->'units') <> 'number' THEN
      RETURN jsonb_build_object('error', 'units must be a number');
    END IF;

    SELECT * INTO v_item FROM items
    WHERE id = (v_line->>'item_id')::uuid
      AND business_id = p_business_id
      AND active = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'unknown item', 'item_id', v_line->>'item_id');
    END IF;

    IF v_item.units_per_tray >= 1000 THEN
      v_line_trays := 0;
      v_prep_used := v_prep_used + v_item.prep_minutes_base * (v_line->>'units')::integer;
    ELSE
      v_line_trays := ceil((v_line->>'units')::numeric / v_item.units_per_tray)::integer;
      v_trays_used := v_trays_used + v_line_trays;
      v_prep_used := v_prep_used + v_item.prep_minutes_base
                     + v_item.prep_minutes_per_extra_tray * GREATEST(v_line_trays - 1, 0);
    END IF;
    IF v_item.lead_time_hours > v_lead_hours THEN
      v_lead_hours := v_item.lead_time_hours;
    END IF;
  END LOOP;

  SELECT * INTO v_cap FROM day_capacity
  WHERE business_id = p_business_id AND date = p_date;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no capacity set for that date');
  END IF;

  SELECT COALESCE((SELECT w.trays_used FROM week_load_for(p_business_id, p_session_id) w
                    WHERE w.date = p_date), 0),
         COALESCE((SELECT w.prep_used FROM week_load_for(p_business_id, p_session_id) w
                    WHERE w.date = p_date), 0)
  INTO v_load_trays, v_load_prep;

  v_fits := (v_load_trays + v_trays_used <= v_cap.trays)
        AND (v_load_prep + v_prep_used <= v_cap.prep_minutes);

  v_earliest_ok := (now() + make_interval(hours => v_lead_hours))::date;

  -- All dates in the next 14 days that fit, ranked by closeness, up to 3.
  -- Binding limit = the resource the request consumes a larger PROPORTION of
  -- that day's remaining headroom (trays fill vs prep fill). A resource the
  -- request does not use at all can never be the binding one.
  WITH window_days AS (
    SELECT dc.date, dc.trays, dc.prep_minutes,
      COALESCE((SELECT w.trays_used FROM week_load_for(p_business_id, GLOBAL_SENTINEL) w
                WHERE w.date = dc.date), 0) AS alt_trays,
      COALESCE((SELECT w.prep_used FROM week_load_for(p_business_id, GLOBAL_SENTINEL) w
                WHERE w.date = dc.date), 0) AS alt_prep
    FROM day_capacity dc
    WHERE dc.business_id = p_business_id
      AND dc.date > p_date
      AND dc.date <= p_date + 14
      AND dc.date >= v_earliest_ok
  ),
  fitting AS (
    SELECT date, trays, prep_minutes, alt_trays, alt_prep,
      trays - alt_trays AS trays_headroom,
      prep_minutes - alt_prep AS prep_headroom
    FROM window_days
    WHERE alt_trays + v_trays_used <= trays
      AND alt_prep + v_prep_used <= prep_minutes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date,
      'reason', to_char(date, 'FMDay') || ' works — '
        || CASE
             WHEN v_trays_used = 0 THEN 'limited by prep time'
             WHEN v_prep_used = 0 THEN 'limited by oven trays'
             WHEN trays_headroom > 0 AND prep_headroom > 0
               THEN CASE WHEN v_trays_used::numeric / trays_headroom
                           >= v_prep_used::numeric / prep_headroom
                         THEN 'limited by oven trays'
                         ELSE 'limited by prep time' END
             WHEN trays_headroom = 0 THEN 'limited by oven trays'
             ELSE 'limited by prep time'
           END
    )
    ORDER BY date
  )
  INTO v_alternatives
  FROM (
    SELECT * FROM fitting ORDER BY date LIMIT 3
  ) top3;

  v_alternatives := COALESCE(v_alternatives, '[]'::jsonb);

  RETURN jsonb_build_object(
    'fits', v_fits,
    'trays_used', v_trays_used,
    'trays_left', v_cap.trays - v_load_trays,
    'prep_used', v_prep_used,
    'prep_left', v_cap.prep_minutes - v_load_prep,
    'alternatives', v_alternatives
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_capacity(uuid, uuid, date, jsonb) TO anon, authenticated;