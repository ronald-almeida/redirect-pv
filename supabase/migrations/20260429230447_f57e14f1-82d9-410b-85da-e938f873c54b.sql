CREATE TABLE public.links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  destination TEXT,
  page_title TEXT DEFAULT 'Link coming soon',
  page_message TEXT DEFAULT 'This link is being set up. Check back soon.',
  page_icon TEXT DEFAULT '⏳',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view links"
  ON public.links FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert links"
  ON public.links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update links"
  ON public.links FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete links"
  ON public.links FOR DELETE
  TO authenticated
  USING (true);