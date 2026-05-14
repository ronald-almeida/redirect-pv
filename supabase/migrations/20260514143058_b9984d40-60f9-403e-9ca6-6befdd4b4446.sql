
ALTER TABLE public.links
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_limit integer,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_password text,
  ADD COLUMN IF NOT EXISTS allowed_countries text[],
  ADD COLUMN IF NOT EXISTS blocked_ips text[],
  ADD COLUMN IF NOT EXISTS real_urls text[],
  ADD COLUMN IF NOT EXISTS ab_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rotation_index integer NOT NULL DEFAULT 0;

ALTER TABLE public.clicks
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS is_vpn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text;

-- Allow public to update links so the redirect page can increment click_count and rotation_index
DROP POLICY IF EXISTS "Anyone can increment link counters" ON public.links;
CREATE POLICY "Anyone can increment link counters"
  ON public.links FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Atomic increment helper
CREATE OR REPLACE FUNCTION public.increment_link_click(_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.links
     SET click_count = click_count + 1,
         rotation_index = rotation_index + 1
   WHERE id = _link_id;
$$;
