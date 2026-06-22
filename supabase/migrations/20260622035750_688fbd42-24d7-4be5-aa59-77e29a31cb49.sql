
-- Tighten links policies
DROP POLICY IF EXISTS "Anyone can view links" ON public.links;
DROP POLICY IF EXISTS "Anyone can increment link counters" ON public.links;
CREATE POLICY "Authenticated users can view links"
  ON public.links FOR SELECT TO authenticated USING (true);

-- Tighten clicks policies
DROP POLICY IF EXISTS "Anyone can view clicks" ON public.clicks;
DROP POLICY IF EXISTS "Anyone can insert clicks" ON public.clicks;
CREATE POLICY "Authenticated users can view clicks"
  ON public.clicks FOR SELECT TO authenticated USING (true);

-- Tighten settings policies
DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;
CREATE POLICY "Authenticated users can view settings"
  ON public.settings FOR SELECT TO authenticated USING (true);

-- Revoke anon role table privileges (defense in depth — RLS is primary)
REVOKE ALL ON public.links FROM anon;
REVOKE ALL ON public.clicks FROM anon;
REVOKE ALL ON public.settings FROM anon;

-- Lock down SECURITY DEFINER functions called only by the server (service role)
REVOKE EXECUTE ON FUNCTION public.increment_link_click(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_redirect_metrics(uuid, integer) FROM anon, authenticated, PUBLIC;
-- Admin recompute/reset functions are called by authenticated admin in the app
REVOKE EXECUTE ON FUNCTION public.reset_link_counters(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_link_counters(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_all_link_counters() FROM anon, PUBLIC;
