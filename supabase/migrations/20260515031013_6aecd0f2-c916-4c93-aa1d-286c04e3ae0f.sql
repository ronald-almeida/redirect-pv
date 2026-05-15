ALTER TABLE public.links ADD COLUMN IF NOT EXISTS owner_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS owner_ips text[] NOT NULL DEFAULT '{}';