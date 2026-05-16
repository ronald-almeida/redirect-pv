
REVOKE EXECUTE ON FUNCTION public.recompute_link_counters(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reset_link_counters(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recompute_all_link_counters() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.recompute_link_counters(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_link_counters(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_link_counters() TO authenticated;
