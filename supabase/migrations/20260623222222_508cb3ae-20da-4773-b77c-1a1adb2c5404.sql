DELETE FROM public.clicks WHERE link_id IN (SELECT id FROM public.links WHERE slug='probe_freshslug_zzz');
DELETE FROM public.links WHERE slug='probe_freshslug_zzz';