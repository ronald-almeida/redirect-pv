INSERT INTO public.links (slug, name, mode, real_url, active)
VALUES ('probe_freshslug_zzz', 'Probe — recém-criado', 'real', 'https://example.com/fresh-probe', true)
ON CONFLICT (slug) DO UPDATE SET active = true, real_url = EXCLUDED.real_url;