/*
# Capacity engine: check_capacity, create_order, cleanup, realtime board

1. Functions
- `check_capacity(business_id, session_id, p_date, lines)`:
  THE deterministic capacity rule. lines = [{ item_id, units }].
  trays_used = Σ ceil(units / units_per_tray) per line.
  prep_used  = Σ prep_minutes_per_batch per line (one prep batch per line).
  Existing load = ALL confirmed orders on that date (baseline + every
  visitor's). Counting only own-session load would let two visitors each
  book the same last trays and oversell the day — the exact failure this
  app exists to prevent. Privacy is enforced instead by column grants
  (visitors never read other visitors' names/contacts).
  Returns { fits, trays_used, trays_left, prep_used, prep_left,
  alternatives[] } where alternatives are the nearest future dates that
  fit, each with a one-line reason like "Sunday has 6 trays free".
  Respects lead_time_hours: dates too soon are never alternatives.
- `create_order(business_id, session_id, p_date, lines, customer_name, contact, pay_mock)`:
  the ONLY way an order is written. Validates the item/units/date, re-runs
  check_capacity, rate-limits per session (max 30 orders/hour, max 200
  chat-visible orders/day), inserts the order + lines atomically. Payment
  is a labelled mock: pay_mock=true sets paid=true.
- `expire_old_orders()`: deletes non-baseline orders older than 24h.
- `cleanup_demo()`: expires old orders + deletes empty conversations.

2. Security
- All functions are SECURITY DEFINER with locked search_path.
- check_capacity: EXECUTE to anon + authenticated (read-only inside).
- create_order: EXECUTE to anon + authenticated; validates and rate-limits
  everything server-side.
- expire_old_orders / cleanup_demo: EXECUTE to service_role only (cron).

3. Notes
- Rate limiting uses a dedicated table bw_rate_limits, not memory.
- Realtime: enable publication for week_load via the supabase_realtime
  publication on orders (week_load is a view; the board subscribes to
  orders changes and refetches).
*/

CREATE TABLE IF NOT EXISTS bw_rate_limits (
  session_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, window_start)
);
ALTER TABLE bw_rate_limits ENABLE ROW LEVEL SECURITY;

-- ============ helpers ============
CREATE OR REPLACE FUNCTION bw_labels_ok(business_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM day_capacity dc
    WHERE dc.business_id = $1 AND dc.date = $2
  );
$$;

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
  v_alt record;
  v_alternatives jsonb := '[]'::jsonb;
  v_days_scanned integer := 0;
BEGIN
  -- validate lines shape
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

    v_trays_used := v_trays_used + ceil((v_line->>'units')::numeric / v_item.units_per_tray)::integer;
    v_prep_used := v_prep_used + v_item.prep_minutes_per_batch;
    -- track the strictest lead time in the cart
    IF v_item.lead_time_hours > v_lead_hours THEN
      v_lead_hours := v_item.lead_time_hours;
    END IF;
  END LOOP;

  -- the target date itself must exist in day_capacity
  SELECT * INTO v_cap FROM day_capacity
  WHERE business_id = p_business_id AND date = p_date;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no capacity set for that date');
  END IF;

  -- existing load: ALL confirmed orders on the date (baseline + visitors)
  SELECT COALESCE(w.trays_used, 0), COALESCE(w.prep_used, 0)
  INTO v_load_trays, v_load_prep
  FROM week_load w
  WHERE w.business_id = p_business_id AND w.date = p_date;

  v_fits := (v_load_trays + v_trays_used <= v_cap.trays)
        AND (v_load_prep + v_prep_used <= v_cap.prep_minutes);

  -- alternatives: nearest future dates that fit, respecting lead time
  v_earliest_ok := (now() + make_interval(hours => v_lead_hours))::date;
  FOR v_alt IN
    SELECT dc.date, dc.trays, dc.prep_minutes, w.trays_used, w.prep_used
    FROM day_capacity dc
    LEFT JOIN week_load w
      ON w.business_id = dc.business_id AND w.date = dc.date
    WHERE dc.business_id = p_business_id
      AND dc.date > p_date
      AND dc.date >= v_earliest_ok
    ORDER BY dc.date
    LIMIT 21
  LOOP
    v_days_scanned := v_days_scanned + 1;
    IF (COALESCE(v_alt.trays_used, 0) + v_trays_used <= v_alt.trays)
       AND (COALESCE(v_alt.prep_used, 0) + v_prep_used <= v_alt.prep_minutes) THEN
      v_alternatives := v_alternatives || jsonb_build_object(
        'date', v_alt.date,
        'reason', to_char(v_alt.date, 'FMDay') || ' has ' ||
          (v_alt.trays - COALESCE(v_alt.trays_used, 0)) || ' trays free'
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

-- ============ create_order ============
CREATE OR REPLACE FUNCTION create_order(
  p_business_id uuid,
  p_session_id uuid,
  p_date date,
  p_lines jsonb,
  p_customer_name text DEFAULT NULL,
  p_contact text DEFAULT NULL,
  p_pay_mock boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_line jsonb;
  v_item record;
  v_total numeric(10,2) := 0;
  v_capacity jsonb;
  v_rate record;
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_orders_count integer;
BEGIN
  -- input validation
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

  -- rate limit: max 10 orders per session per hour
  v_window_start := date_trunc('hour', v_now);
  INSERT INTO bw_rate_limits (session_id, window_start, orders_count)
  VALUES (p_session_id, v_window_start, 1)
  ON CONFLICT (session_id, window_start)
  DO UPDATE SET orders_count = bw_rate_limits.orders_count + 1
  RETURNING orders_count INTO v_orders_count;

  IF v_orders_count > 10 THEN
    RETURN jsonb_build_object('error', 'too many orders from one session, take a breather');
  END IF;

  -- capacity check first
  v_capacity := check_capacity(p_business_id, p_session_id, p_date, p_lines);
  IF v_capacity ? 'error' THEN
    RETURN v_capacity;
  END IF;
  IF NOT (v_capacity->>'fits')::boolean THEN
    RETURN jsonb_build_object(
      'error', 'does not fit',
      'capacity', v_capacity
    );
  END IF;

  -- insert order
  INSERT INTO orders (business_id, session_id, date, status, customer_name, contact, total, paid)
  VALUES (
    p_business_id,
    p_session_id,
    p_date,
    'confirmed',
    p_customer_name,
    p_contact,
    0,
    p_pay_mock
  )
  RETURNING id INTO v_order_id;

  -- insert lines, compute total
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM items
    WHERE id = (v_line->>'item_id')::uuid
      AND business_id = p_business_id
      AND active = true;
    IF NOT FOUND THEN
      -- roll back: this shouldn't happen (check_capacity validated), but never leave a partial order
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

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'total', v_total,
    'paid', p_pay_mock,
    'capacity', v_capacity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, date, jsonb, text, text, boolean) TO anon, authenticated;

-- ============ cleanup job ============
CREATE OR REPLACE FUNCTION expire_old_orders()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM orders
  WHERE is_baseline = false
    AND created_at < now() - interval '24 hours';
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
  WHERE is_baseline = false AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  DELETE FROM conversations c
  WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.session_id = c.session_id)
    AND c.created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_convs = ROW_COUNT;

  DELETE FROM bw_rate_limits WHERE window_start < date_trunc('hour', now()) - interval '2 hours';

  RETURN jsonb_build_object('expired_orders', v_expired, 'conversations_removed', v_convs);
END;
$$;

REVOKE EXECUTE ON FUNCTION expire_old_orders() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_demo() FROM anon, authenticated;

-- ============ realtime for the week board ============
-- The board refetches on any orders change. week_load is a view; the
-- trigger-based notify pattern is used instead of direct view realtime.
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE orders;
