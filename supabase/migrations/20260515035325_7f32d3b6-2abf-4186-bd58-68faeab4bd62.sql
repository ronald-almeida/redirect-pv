alter table public.links replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.links;
exception when duplicate_object then null; end $$;