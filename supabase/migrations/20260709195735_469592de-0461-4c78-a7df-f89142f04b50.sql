ALTER TABLE public.links REPLICA IDENTITY FULL;
ALTER TABLE public.clicks REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.links;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clicks;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;