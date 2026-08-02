ALTER TABLE public.link_audit
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS entity_label text,
  ADD COLUMN IF NOT EXISTS before_value jsonb,
  ADD COLUMN IF NOT EXISTS after_value jsonb;

CREATE INDEX IF NOT EXISTS idx_link_audit_created_at ON public.link_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_audit_entity ON public.link_audit (entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_audit_action ON public.link_audit (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clicks_created_at ON public.clicks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_link_created ON public.clicks (link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_device ON public.clicks (device);
CREATE INDEX IF NOT EXISTS idx_clicks_country ON public.clicks (country);
CREATE INDEX IF NOT EXISTS idx_clicks_mode ON public.clicks (mode_at_click);