ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "paidAt" text,
    ADD COLUMN IF NOT EXISTS "paidBy" text;

ALTER TABLE public.archive
    ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "paidAt" text,
    ADD COLUMN IF NOT EXISTS "paidBy" text;
