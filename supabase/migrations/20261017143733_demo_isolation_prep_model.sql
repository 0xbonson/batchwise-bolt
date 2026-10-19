/*
# Demo isolation, realtime privacy, prep-minute model (step 2.5)

1. Schema changes
- orders.is_global boolean NOT NULL DEFAULT false:
  - true  = counts for everyone (seeded baseline, owner-created orders)
  - false = counts ONLY for the creating session (visitor demo orders)
- items.prep_minutes_base integer, items.prep_minutes_per_extra_tray integer:
  new prep model. prep for a line = base + per_extra_tray * (trays - 1).
  Old prep_minutes_per_batch column is kept (never dropped); new columns
  are backfilled from it so every existing item works immediately.
- board_updates table: realtime signal with NO personal data
  (id, business_id, date, changed_at), written by triggers on orders.

2. Functions and views
- week_load_for(business_id, session_id) replaces the week_load view as the
  load source: global orders (baseline + owners) plus the caller's own
  session orders. Other visitors' orders are invisible.
- check_capacity + create_order: load lookups now session-scoped via
  week_load_for; create_order gains p_global (owner path sets true).
- expiry: visitor (non-global) orders expire after 2 HOURS; baseline and
  owner orders persist. cleanup_demo updated to match.
- reset_demo(session_id): deletes a session's own visitor orders (the
  Reset demo button's backing function).

3. Realtime privacy
- orders is REMOVED from the supabase_realtime publication (its payloads
  would carry customer_name/contact to every subscribed anon client).
- board_updates is published instead; triggers append one signal row per
  affected business+date. The board subscribes to it and refetches
  week_load_for, so numbers shown are still baseline + own session.

4. Security
- RLS on board_updates: SELECT open to anon/authenticated (no personal
  data in the table); writes only via triggers (functions are definer).
- week_load (old view) remains but is no longer the load source; kept to
  avoid breaking anything mid-cutover, reads restricted to service_role.
- create_order grants unchanged (anon, authenticated) with p_global
  defaulting to false; the owner app later calls it via its own path.
*/

-- ============ columns ============
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS prep_minutes_base integer;
ALTER TABLE items ADD COLUMN IF NOT EXISTS prep_minutes_per_extra_tray integer;

-- backfill prep columns from the legacy per-batch value
UPDATE items
SET prep_minutes_base = prep_minutes_per_batch,
    prep_minutes_per_extra_tray = GREATEST(15, round(prep_minutes_per_batch * 0.3)::int)
WHERE prep_minutes_base IS NULL;

ALTER TABLE items ALTER COLUMN prep_minutes_base SET NOT NULL;
ALTER TABLE items ALTER COLUMN prep_minutes_per_extra_tray SET NOT NULL;
ALTER TABLE items ADD CONSTRAINT chk_prep_extra CHECK (prep_minutes_per_extra_tray >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_global_session
  ON orders (business_id, date) WHERE status = 'confirmed';

-- seeded baseline orders count for everyone
UPDATE orders SET is_global = true WHERE is_baseline = true;

-- ============ session-scoped load ============
CREATE OR REPLACE FUNCTION week_load_for(p_business_id uuid, p_session_id uuid)
RETURNS TABLE (date date, trays_used numeric, prep_used numeric, order_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.date,
    sum(ceil(ol.units::numeric / i.units_per_tray)) AS trays_used,
    sum(
      i.prep_minutes_base
      + i.prep_minutes_per_extra_tray * GREATEST(ceil(ol.units::numeric / i.units_per_tray)::int - 1, 0)
    ) AS prep_used,
    count(DISTINCT o.id) AS order_count
  FROM orders o
  JOIN order_lines ol ON ol.order_id = o.id
  JOIN items i ON i.id = ol.item_id
  WHERE o.business_id = p_business_id
    AND o.status = 'confirmed'
    AND (o.is_global OR o.session_id = p_session_id)
  GROUP BY o.date;
$$;

-- old view: no longer the load source; restrict to service_role
REVOKE ALL ON week_load FROM anon, authenticated;

-- ============ capacity function (session-scoped + new prep model) ============
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
  v_alt record;
  v_alternatives jsonb := '[]'::jsonb;
  v_days_scanned integer := 0;
  v_line_trays integer;
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

    v_line_trays := ceil((v_line->>'units')::numeric / v_item.units_per_tray)::integer;
    v_trays_used := v_trays_used + v_line_trays;
    -- prep = base once per line + per-extra-tray for each tray beyond the first
    v_prep_used := v_prep_used + v_item.prep_minutes_base
                   + v_item.prep_minutes_per_extra_tray * GREATEST(v_line_trays - 1, 0);
    IF v_item.lead_time_hours > v_lead_hours THEN
      v_lead_hours := v_item.lead_time_hours;
    END IF;
  END LOOP;

  SELECT * INTO v_cap FROM day_capacity
  WHERE business_id = p_business_id AND date = p_date;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no capacity set for that date');
  END IF;

  -- load = global orders + THIS session's orders (baseline + own; never others')
  SELECT COALESCE((SELECT w.trays_used FROM week_load_for(p_business_id, p_session_id) w
                    WHERE w.date = p_date), 0),
         COALESCE((SELECT w.prep_used FROM week_load_for(p_business_id, p_session_id) w
                    WHERE w.date = p_date), 0)
  INTO v_load_trays, v_load_prep;

  v_fits := (v_load_trays + v_trays_used <= v_cap.trays)
        AND (v_load_prep + v_prep_used <= v_cap.prep_minutes);

  v_earliest_ok := (now() + make_interval(hours => v_lead_hours))::date;
  FOR v_alt IN
    SELECT dc.date, dc.trays, dc.prep_minutes
    FROM day_capacity dc
    WHERE dc.business_id = p_business_id
      AND dc.date > p_date
      AND dc.date >= v_earliest_ok
    ORDER BY dc.date
    LIMIT 21
  LOOP
    v_days_scanned := v_days_scanned + 1;
    -- alternatives are judged against GLOBAL load only: a visitor cannot be
    -- offered a day that fits only because another visitor's order expired soon
    SELECT COALESCE((SELECT w.trays_used FROM week_load_for(p_business_id, '00000000-0000-0000-0000-00000000global'::uuid) w
                      WHERE w.date = v_alt.date), 0),
           COALESCE((SELECT w.prep_used FROM week_load_for(p_business_id, '00000000-0000-0000-0000-00000000global'::uuid) w
                      WHERE w.date = v_alt.date), 0)
    INTO v_load_trays, v_load_prep;
    IF (v_load_trays + v_trays_used <= v_alt.trays)
       AND (v_load_prep + v_prep_used <= v_alt.prep_minutes) THEN
      v_alternatives := v_alternatives || jsonb_build_object(
        'date', v_alt.date,
        'reason', to_char(v_alt.date, 'FMDay') || ' has ' ||
          (v_alt.trays - v_load_trays) || ' trays free'
      );
      EXIT WHEN jsonb_array_length(v_alternatives) >= 3;
    END IF;
    EXIT WHEN v_days_scanned >= 21;
  END LOOP;

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

-- ============ create_order (adds p_global, session-scoped check) ============
CREATE OR REPLACE FUNCTION create_order(
  p_business_id uuid,
  p_session_id uuid,
  p_date date,
  p_lines jsonb,
  p_customer_name text DEFAULT NULL,
  p_contact text DEFAULT NULL,
  p_pay_mock boolean DEFAULT false,
  p_global boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_line jsonb;
  v_item record;
  v_total numeric(10,2) := 0;
  v_capacity jsonb;
  v_orders_count integer;
  v_window_start timestamptz;
  v_now timestamptz := now();
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 10 THEN
    RETURN jsonb_build_object('error', 'lines must be an array of 1-10 items');
  END IF;
  IF p_customer_name IS NOT NULL AND length(p_customer_name) > 80 THEN
    RETURN jsonb_build_object('error', 'name too long');
  END IF;
  IF p_contact IS NOT NULL AND length(p_contact) > 200 THEN
    RETURN jsonb_build_object('error', 'contact too long');
  END IF;
  IF p_date < (v_now + interval '1 hour')::date THEN
    RETURN jsonb_build_object('error', 'that day is too soon to bake for');
  END IF;

  v_window_start := date_trunc('hour', v_now);
  INSERT INTO bw_rate_limits (session_id, window_start, orders_count)
  VALUES (p_session_id, v_window_start, 1)
  ON CONFLICT (session_id, window_start)
  DO UPDATE SET orders_count = bw_rate_limits.orders_count + 1
  RETURNING orders_count INTO v_orders_count;

  IF v_orders_count > 10 THEN
    RETURN jsonb_build_object('error', 'too many orders from one session, take a breather');
  END IF;

  v_capacity := check_capacity(p_business_id, p_session_id, p_date, p_lines);
  IF v_capacity ? 'error' THEN
    RETURN v_capacity;
  END IF;
  IF NOT (v_capacity->>'fits')::boolean THEN
    RETURN jsonb_build_object('error', 'does not fit', 'capacity', v_capacity);
  END IF;

  INSERT INTO orders (business_id, session_id, date, status, customer_name, contact, total, paid, is_global)
  VALUES (p_business_id, p_session_id, p_date, 'confirmed', p_customer_name, p_contact, 0, p_pay_mock, p_global)
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM items
    WHERE id = (v_line->>'item_id')::uuid AND business_id = p_business_id AND active = true;
    IF NOT FOUND THEN
      DELETE FROM orders WHERE id = v_order_id;
      RETURN jsonb_build_object('error', 'unknown item');
    END IF;
    IF (v_line->>'units')::integer < 1 OR (v_line->>'units')::integer > 10000 THEN
      DELETE FROM orders WHERE id = v_order_id;
      RETURN jsonb_build_object('error', 'units out of range');
    END IF;

    INSERT INTO order_lines (order_id, item_id, units, unit_price)
    VALUES (v_order_id, v_item.id, (v_line->>'units')::integer, v_item.price_per_unit);
    v_total := v_total + v_item.price_per_unit * (v_line->>'units')::integer;
  END LOOP;

  UPDATE orders SET total = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_total, 'paid', p_pay_mock, 'capacity', v_capacity);
END;
$$;

GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, date, jsonb, text, text, boolean, boolean) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION week_load_for(uuid, uuid) TO anon, authenticated;

-- ============ expiry: visitor orders live 2 hours ============
CREATE OR REPLACE FUNCTION expire_old_orders()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM orders
  WHERE is_global = false
    AND created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_demo()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expired integer;
  v_convs integer;
BEGIN
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

REVOKE EXECUTE ON FUNCTION expire_old_orders() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_demo() FROM anon, authenticated;

-- Reset demo button backing: a visitor clears only their own visitor orders
CREATE OR REPLACE FUNCTION reset_demo(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM orders WHERE session_id = p_session_id AND is_global = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_demo(uuid) TO anon, authenticated;

-- ============ board_updates: realtime without personal data ============
CREATE TABLE IF NOT EXISTS board_updates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL,
  date date NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE board_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_board_updates" ON board_updates;
CREATE POLICY "read_board_updates" ON board_updates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_no_direct_board_updates" ON board_updates;
CREATE POLICY "insert_no_direct_board_updates" ON board_updates FOR INSERT
  TO anon, authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION bw_notify_board_change()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO board_updates (business_id, date) VALUES (OLD.business_id, OLD.date);
  ELSE
    INSERT INTO board_updates (business_id, date) VALUES (NEW.business_id, NEW.date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_board_change ON orders;
CREATE TRIGGER trg_orders_board_change
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION bw_notify_board_change();

-- ============ publication swap ============
ALTER PUBLICATION supabase_realtime DROP TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE board_updates;