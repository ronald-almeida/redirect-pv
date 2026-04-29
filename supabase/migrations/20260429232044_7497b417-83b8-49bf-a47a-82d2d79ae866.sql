ALTER TABLE public.links ADD COLUMN real_url text;
ALTER TABLE public.links ADD COLUMN decoy_url text;
ALTER TABLE public.links ADD COLUMN mode text NOT NULL DEFAULT 'waiting';

UPDATE public.links SET real_url = destination WHERE destination IS NOT NULL;
UPDATE public.links SET mode = 'real' WHERE destination IS NOT NULL;

ALTER TABLE public.links DROP COLUMN destination;

ALTER TABLE public.links ADD CONSTRAINT links_mode_check CHECK (mode IN ('real','decoy','waiting'));