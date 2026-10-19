/*
# Harden functions and rate-limit table per security advisor

1. Security changes
- `bw_labels_ok` was an unused helper: DROP it.
- `cleanup_demo` and `expire_old_orders`: REVOKE EXECUTE from anon +
  authenticated (already revoked at creation, re-asserted idempotently).
- `bw_rate_limits` is written only inside SECURITY DEFINER functions;
  add a deny-all SELECT policy so the linter sees an explicit policy and
  anon can never read rate rows.
- `week_load` view: kept security_definer intentionally (it exposes only
  aggregate trays/prep per date, no identities) — the linter warning is
  acknowledged; aggregates are the board's data source.
2. Notes
- check_capacity and create_order remain intentionally public: they are
  the validated, rate-limited API of the demo.
*/

DROP FUNCTION IF EXISTS bw_labels_ok(uuid, date);

REVOKE EXECUTE ON FUNCTION cleanup_demo() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION expire_old_orders() FROM anon, authenticated;

DROP POLICY IF EXISTS "deny_all_rate_limits" ON bw_rate_limits;
CREATE POLICY "deny_all_rate_limits" ON bw_rate_limits FOR SELECT
  TO anon, authenticated USING (false);