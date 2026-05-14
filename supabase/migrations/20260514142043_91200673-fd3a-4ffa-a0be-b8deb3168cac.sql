CREATE TABLE public.clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  mode_at_click text NOT NULL CHECK (mode_at_click IN ('real','decoy','waiting')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_clicks_link_id ON public.clicks(link_id);
CREATE INDEX idx_clicks_mode ON public.clicks(mode_at_click);

ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert clicks"
ON public.clicks FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can view clicks"
ON public.clicks FOR SELECT
TO public
USING (true);