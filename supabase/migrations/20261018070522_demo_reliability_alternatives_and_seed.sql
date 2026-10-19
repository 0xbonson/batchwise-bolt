/*
# Demo reliability: alternatives search + seed retune

1. check_capacity alternatives overhaul
   - Search window widened to 14 calendar days after the requested date.
   - Collects ALL fitting dates in the window, ranks by closeness, returns up to 3.
   - Each reason now states the binding limit: "limited by oven trays" when
     trays is the tighter margin (or tied), "limited by prep time" when prep
     is the tighter margin.

2. Seed retune (Odile's Kitchen only)
   - Cupcakes prep reduced (90/27 -> 60/18 base/extra-tray) so prep is no
     longer the first binding limit for typical demo orders; trays bind first.
   - prep_minutes_per_batch aligned to the new base values.

3. No table/column changes. No RLS changes. Data changes scoped to the demo
   business 00000000-0000-0000-0000-000000000001.
*/

-- ============ check_capacity ============
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
  v_limit_by text;
  v_reason text;
  GLOBAL_SENTINEL constant uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
BEGIN
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
  -- Reason states which limit is binding: the smaller remaining margin
  -- (margin 0 or both equal -> trays; prep margin strictly smaller -> prep).
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
      trays - alt_trays - v_trays_used AS trays_margin,
      prep_minutes - alt_prep - v_prep_used AS prep_margin
    FROM window_days
    WHERE alt_trays + v_trays_used <= trays
      AND alt_prep + v_prep_used <= prep_minutes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date,
      'reason', to_char(date, 'FMDay') || ' works — '
        || CASE WHEN trays_margin <= prep_margin THEN 'limited by oven trays'
                ELSE 'limited by prep time' END
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

-- ============ seed retune: Cupcakes prep ============
UPDATE items
SET prep_minutes_base = 60,
    prep_minutes_per_extra_tray = 18,
    prep_minutes_per_batch = 60
WHERE business_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Cupcakes';