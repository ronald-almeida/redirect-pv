
CREATE OR REPLACE FUNCTION public.recompute_link_counters(_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.links l
     SET click_count = COALESCE(c.cnt, 0),
         total_redirects = COALESCE(c.cnt, 0)
    FROM (
      SELECT COUNT(*)::int AS cnt
        FROM public.clicks
       WHERE link_id = _link_id
    ) c
   WHERE l.id = _link_id;
$$;

CREATE OR REPLACE FUNCTION public.reset_link_counters(_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.links
     SET click_count = 0,
         total_redirects = 0,
         avg_redirect_ms = 0,
         last_redirect_ms = 0,
         rotation_index = 0
   WHERE id = _link_id;
$$;

CREATE OR REPLACE FUNCTION public.recompute_all_link_counters()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.links l
     SET click_count = COALESCE(c.cnt, 0),
         total_redirects = COALESCE(c.cnt, 0)
    FROM (
      SELECT link_id, COUNT(*)::int AS cnt
        FROM public.clicks
       GROUP BY link_id
    ) c
   WHERE l.id = c.link_id;

  UPDATE public.links
     SET click_count = 0,
         total_redirects = 0
   WHERE id NOT IN (SELECT DISTINCT link_id FROM public.clicks);
$$;
