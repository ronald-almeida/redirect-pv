ALTER TABLE public.domains
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS cf_api_token_secret text,
  ADD COLUMN IF NOT EXISTS cf_dns_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS cf_worker_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS cf_ssl_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_at timestamptz;