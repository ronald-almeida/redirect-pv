ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS cache_status text;
CREATE INDEX IF NOT EXISTS idx_clicks_cache_status ON public.clicks(cache_status);