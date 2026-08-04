ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS self_order_enabled boolean NOT NULL DEFAULT true;
