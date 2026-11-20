-- SDD Escenario 477 §4 (C6): Hardening DDL for Digital/Transport/OPS
ALTER TABLE public.provider_novelties ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS total_crates INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_returns_dedup_key_unique
  ON public.billing_returns (dedup_key)
  WHERE dedup_key IS NOT NULL;
