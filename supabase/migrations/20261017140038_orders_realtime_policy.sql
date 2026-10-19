/*
# Allow realtime order events for the live week board

1. Security changes
- Replace the session-scoped SELECT policy on orders with USING(true) for
  anon + authenticated. This is safe because customer_name and contact are
  NOT in the anon column grants (see earlier column revoke), so no visitor
  identity is ever exposed; rows are fictional demo data.
- Purpose: realtime postgres_changes events reach every client, so the
  week board updates live when anyone confirms an order.
- Other visitors' order rows expose only date/status/total — the same
  aggregates the public week_load view already shows.
*/

DROP POLICY IF EXISTS "read_own_orders" ON orders;

CREATE POLICY "read_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);
