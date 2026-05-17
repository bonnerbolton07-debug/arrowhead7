-- =============================================================================
-- Data API grants for Arrowhead 7
-- =============================================================================
-- Supabase changed project defaults so SQL-created tables may not be exposed
-- to PostgREST/GraphQL automatically. A7's browser and route-handler clients
-- still rely on RLS for row ownership, but authenticated users need explicit
-- table/function privileges for the Data API to reach those RLS policies.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated;

GRANT SELECT ON public.trend_cache TO authenticated;

GRANT EXECUTE ON FUNCTION public.debit_credit(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, int) TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
