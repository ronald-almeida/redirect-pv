alter table public.links add column if not exists avg_redirect_ms integer not null default 0;
alter table public.links add column if not exists last_redirect_ms integer not null default 0;
alter table public.links add column if not exists total_redirects integer not null default 0;

alter table public.clicks add column if not exists redirect_ms integer;

create or replace function public.record_redirect_metrics(_link_id uuid, _ms integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.links
     set last_redirect_ms = _ms,
         avg_redirect_ms  = ((avg_redirect_ms::bigint * total_redirects) + _ms) / (total_redirects + 1),
         total_redirects  = total_redirects + 1
   where id = _link_id;
$$;