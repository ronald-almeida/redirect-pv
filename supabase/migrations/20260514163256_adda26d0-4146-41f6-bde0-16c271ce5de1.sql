ALTER TABLE public.clicks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clicks;