CREATE TABLE public.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.domains TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domains TO authenticated;
GRANT ALL ON public.domains TO service_role;

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view domains"
  ON public.domains FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage domains"
  ON public.domains FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.domains (domain, is_primary) VALUES ('birgredi.shop', true);