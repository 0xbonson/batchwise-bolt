/*
# Batchwise core schema: businesses, items, capacity, orders, conversations

1. New Tables
- `businesses`: one row per bakery. name, slug, currency, symbol, is_demo.
- `items`: menu items per business. name, keywords (lowercase words for chat
  matching), price_per_unit, units_per_tray, prep_minutes_per_batch,
  lead_time_hours, active.
- `day_capacity`: per business per date, trays and prep_minutes limits.
- `orders`: business_id, session_id, date, status
  (pending/confirmed/cancelled), customer_name, contact, total, paid (mock
  payment flag). Anonymous visitors can never read customer_name or contact
  of other sessions; owner service role can.
- `order_lines`: order_id, item_id, units, unit_price (copied at order time).
- `conversations`: business_id, session_id, channel, state, taken_over_by_owner.
- `messages`: conversation_id, role (customer/agent/owner/system), text, created_at.

2. Security
- RLS enabled on every table.
- Reads of menu, capacity and aggregate order info are open to anon +
  authenticated (this is an intentionally public demo storefront).
- Writes: anon CANNOT insert/update/delete any table directly. Order
  creation and status changes go through SECURITY DEFINER functions that
  validate input and rate-limit per session.
- Column privacy: customer_name and contact on orders are protected by
  granting column-level SELECT on orders to anon/authenticated excluding
  those two columns. Other visitors' identities are never readable.

3. Notes
- session_id is a UUID generated in the browser per visitor, stored for
  demo state scoping. Visitor orders expire after 24h (cleanup function).
*/

-- ============ businesses ============
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  symbol text NOT NULL DEFAULT '$',
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ items ============
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  price_per_unit numeric(10,2) NOT NULL CHECK (price_per_unit >= 0),
  units_per_tray integer NOT NULL CHECK (units_per_tray > 0),
  prep_minutes_per_batch integer NOT NULL CHECK (prep_minutes_per_batch >= 0),
  lead_time_hours integer NOT NULL DEFAULT 24 CHECK (lead_time_hours >= 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (business_id, name)
);

-- ============ day_capacity ============
CREATE TABLE IF NOT EXISTS day_capacity (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date date NOT NULL,
  trays integer NOT NULL CHECK (trays > 0),
  prep_minutes integer NOT NULL CHECK (prep_minutes > 0),
  PRIMARY KEY (business_id, date)
);

-- ============ orders ============
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  customer_name text,
  contact text,
  total numeric(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid boolean NOT NULL DEFAULT false,
  is_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_business_date
  ON orders (business_id, date) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_orders_session
  ON orders (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_expiry
  ON orders (is_baseline, created_at);

-- ============ order_lines ============
CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  units integer NOT NULL CHECK (units > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order
  ON order_lines (order_id);

-- ============ conversations ============
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'open',
  taken_over_by_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, session_id)
);

-- ============ messages ============
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'agent', 'owner', 'system')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, created_at);

-- ============ RLS ============
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Public demo storefront: anon + authenticated may READ menu, capacity,
-- and order *counts* (not other visitors' identities).
DROP POLICY IF EXISTS "read_businesses" ON businesses;
CREATE POLICY "read_businesses" ON businesses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_items" ON items;
CREATE POLICY "read_items" ON items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "read_day_capacity" ON day_capacity;
CREATE POLICY "read_day_capacity" ON day_capacity FOR SELECT
  TO anon, authenticated USING (true);

-- Orders: SELECT restricted to own session rows only. The week board's
-- aggregate counts come from the public view + RPC (see below), never
-- from direct SELECT.
DROP POLICY IF EXISTS "read_own_orders" ON orders;
CREATE POLICY "read_own_orders" ON orders FOR SELECT
  TO anon, authenticated USING (session_id::text = current_setting('request.headers', true)::json->>'x-bw-session');

DROP POLICY IF EXISTS "insert_no_direct_orders" ON orders;
CREATE POLICY "insert_no_direct_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_no_direct_orders" ON orders;
CREATE POLICY "update_no_direct_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "delete_no_direct_orders" ON orders;
CREATE POLICY "delete_no_direct_orders" ON orders FOR DELETE
  TO anon, authenticated USING (false);

-- Order lines follow the parent order's session.
DROP POLICY IF EXISTS "read_own_order_lines" ON order_lines;
CREATE POLICY "read_own_order_lines" ON order_lines FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_lines.order_id
        AND o.session_id::text = current_setting('request.headers', true)::json->>'x-bw-session'
    )
  );

DROP POLICY IF EXISTS "insert_no_direct_order_lines" ON order_lines;
CREATE POLICY "insert_no_direct_order_lines" ON order_lines FOR INSERT
  TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_no_direct_order_lines" ON order_lines;
CREATE POLICY "update_no_direct_order_lines" ON order_lines FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "delete_no_direct_order_lines" ON order_lines;
CREATE POLICY "delete_no_direct_order_lines" ON order_lines FOR DELETE
  TO anon, authenticated USING (false);

-- Conversations: owner/agent tooling goes through functions; visitors may
-- read their own conversation.
DROP POLICY IF EXISTS "read_own_conversations" ON conversations;
CREATE POLICY "read_own_conversations" ON conversations FOR SELECT
  TO anon, authenticated USING (session_id::text = current_setting('request.headers', true)::json->>'x-bw-session');

DROP POLICY IF EXISTS "insert_no_direct_conversations" ON conversations;
CREATE POLICY "insert_no_direct_conversations" ON conversations FOR INSERT
  TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_no_direct_conversations" ON conversations;
CREATE POLICY "update_no_direct_conversations" ON conversations FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "delete_no_direct_conversations" ON conversations;
CREATE POLICY "delete_no_direct_conversations" ON conversations FOR DELETE
  TO anon, authenticated USING (false);

-- Messages follow the conversation's session.
DROP POLICY IF EXISTS "read_own_messages" ON messages;
CREATE POLICY "read_own_messages" ON messages FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND c.session_id::text = current_setting('request.headers', true)::json->>'x-bw-session'
    )
  );

DROP POLICY IF EXISTS "insert_no_direct_messages" ON messages;
CREATE POLICY "insert_no_direct_messages" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_no_direct_messages" ON messages;
CREATE POLICY "update_no_direct_messages" ON messages FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "delete_no_direct_messages" ON messages;
CREATE POLICY "delete_no_direct_messages" ON messages FOR DELETE
  TO anon, authenticated USING (false);

-- ============ column privacy on orders ============
-- anon + authenticated can read order rows EXCEPT customer_name/contact,
-- so a visitor can render their own slip but never learn who else ordered.
REVOKE ALL ON orders FROM anon, authenticated;
GRANT SELECT (id, business_id, session_id, date, status, total, paid, is_baseline, created_at)
  ON orders TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON orders TO service_role; -- functions only, revoked by RLS anyway

-- ============ public week board view ============
-- Aggregate tray load per date. No identities, no names, safe for anon.
CREATE OR REPLACE VIEW public.week_load
WITH (security_invoker = false) AS
SELECT
  o.business_id,
  o.date,
  count(DISTINCT o.id) AS order_count,
  COALESCE(sum(l.trays), 0) AS trays_used,
  COALESCE(sum(l.prep), 0) AS prep_used
FROM orders o
JOIN LATERAL (
  SELECT
    sum(ceil(ol.units::numeric / i.units_per_tray)) AS trays,
    sum(i.prep_minutes_per_batch) AS prep
  FROM order_lines ol
  JOIN items i ON i.id = ol.item_id
  WHERE ol.order_id = o.id
) l ON true
WHERE o.status = 'confirmed'
GROUP BY o.business_id, o.date;
