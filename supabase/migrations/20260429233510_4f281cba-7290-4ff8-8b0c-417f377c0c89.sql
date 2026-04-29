CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_waiting_url text NOT NULL DEFAULT 'https://sistema.cobrafix.com.br/pagfix/login.php',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert settings"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

INSERT INTO public.settings (default_waiting_url)
VALUES ('https://sistema.cobrafix.com.br/pagfix/login.php');