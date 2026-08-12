-- Migration: Add Scarcity Control columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS scarcity_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS scarcity_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scarcity_message TEXT,
ADD COLUMN IF NOT EXISTS scarcity_disabled_by TEXT;

-- Index for high-performance filtering on active/scarcity status
CREATE INDEX IF NOT EXISTS idx_products_scarcity_status ON public.products (scarcity_status);
