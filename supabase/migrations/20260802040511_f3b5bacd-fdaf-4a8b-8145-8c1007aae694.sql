-- ── Links: arquivamento + ativação automática + último acesso ──────────────
ALTER TABLE public.links
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_activate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_activate_after integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_click_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain_id uuid REFERENCES public.domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── Clicks: host do acesso ─────────────────────────────────────────────────
ALTER TABLE public.clicks
  ADD COLUMN IF NOT EXISTS host text;

-- ── Domains: status de validação ───────────────────────────────────────────
ALTER TABLE public.domains
  ADD COLUMN IF NOT EXISTS dns_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS worker_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_error text,
  ADD COLUMN IF NOT EXISTS cf_zone_id text,
  ADD COLUMN IF NOT EXISTS notes text;

-- ── Settings: preparação Cloudflare + padrão de ativação automática ────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cf_account_id text,
  ADD COLUMN IF NOT EXISTS cf_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_auto_activate_after integer NOT NULL DEFAULT 10;

-- ── Alertas ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  detail text,
  link_id uuid REFERENCES public.links(id) ON DELETE SET NULL,
  domain_id uuid REFERENCES public.domains(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view alerts" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage alerts" ON public.alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Auditoria de slugs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid REFERENCES public.links(id) ON DELETE SET NULL,
  slug text,
  action text NOT NULL,
  detail jsonb,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.link_audit TO authenticated;
GRANT ALL ON public.link_audit TO service_role;
ALTER TABLE public.link_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view audit" ON public.link_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert audit" ON public.link_audit FOR INSERT TO authenticated WITH CHECK (true);

-- ── Índices de performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clicks_created_at ON public.clicks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_link_created ON public.clicks (link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_host ON public.clicks (host);
CREATE INDEX IF NOT EXISTS idx_links_slug ON public.links (slug);
CREATE INDEX IF NOT EXISTS idx_links_archived ON public.links (archived_at);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON public.alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_audit_created ON public.link_audit (created_at DESC);

-- ── Ativação automática: aplicada no incremento de clique ──────────────────
CREATE OR REPLACE FUNCTION public.increment_link_click(_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.links%ROWTYPE;
BEGIN
  UPDATE public.links
     SET click_count = click_count + 1,
         rotation_index = rotation_index + 1,
         last_click_at = now()
   WHERE id = _link_id
  RETURNING * INTO _row;

  IF _row.id IS NOT NULL
     AND _row.auto_activate
     AND _row.mode <> 'real'
     AND _row.archived_at IS NULL
     AND (_row.real_url IS NOT NULL OR COALESCE(array_length(_row.real_urls, 1), 0) > 0)
     AND _row.click_count >= _row.auto_activate_after
  THEN
    UPDATE public.links SET mode = 'real', updated_at = now() WHERE id = _row.id;

    INSERT INTO public.link_audit (link_id, slug, action, detail, actor)
    VALUES (_row.id, _row.slug, 'auto_activate',
            jsonb_build_object('clicks', _row.click_count, 'threshold', _row.auto_activate_after),
            'system');

    INSERT INTO public.alerts (kind, severity, title, detail, link_id)
    VALUES ('auto_activate', 'info',
            'Slug ativada automaticamente',
            format('/%s atingiu %s acessos e entrou em modo REAL.', _row.slug, _row.click_count),
            _row.id);
  END IF;
END;
$function$;
