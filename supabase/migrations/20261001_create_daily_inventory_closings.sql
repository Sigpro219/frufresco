-- ==============================================================================
-- Migration: Create daily_inventory_closings
-- Table for Official Daily Inventory Freeze & Multi-day Stock Inheritance
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.daily_inventory_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_date DATE NOT NULL UNIQUE,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by_name TEXT NOT NULL DEFAULT 'Supervisor de Operaciones',
    notes TEXT,
    total_calculated NUMERIC(14, 2) DEFAULT 0,
    total_physical NUMERIC(14, 2) DEFAULT 0,
    total_missing NUMERIC(14, 2) DEFAULT 0,
    total_surplus NUMERIC(14, 2) DEFAULT 0,
    is_locked BOOLEAN NOT NULL DEFAULT true,
    snapshot_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_inventory_closings_date ON public.daily_inventory_closings(closing_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_inventory_closings_locked ON public.daily_inventory_closings(is_locked);

-- Enable Row Level Security (RLS)
ALTER TABLE public.daily_inventory_closings ENABLE ROW LEVEL SECURITY;

-- Permissive policies for operations team and authenticated clients
DROP POLICY IF EXISTS "Allow read daily_inventory_closings" ON public.daily_inventory_closings;
CREATE POLICY "Allow read daily_inventory_closings" ON public.daily_inventory_closings
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow insert daily_inventory_closings" ON public.daily_inventory_closings;
CREATE POLICY "Allow insert daily_inventory_closings" ON public.daily_inventory_closings
    FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update daily_inventory_closings" ON public.daily_inventory_closings;
CREATE POLICY "Allow update daily_inventory_closings" ON public.daily_inventory_closings
    FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete daily_inventory_closings" ON public.daily_inventory_closings;
CREATE POLICY "Allow delete daily_inventory_closings" ON public.daily_inventory_closings
    FOR DELETE TO public USING (true);

COMMENT ON TABLE public.daily_inventory_closings IS 'Captura inmutable del Balance Diario de Masa (24 Columnas). El saldo final de la Columna U se convierte en el saldo inicial del día siguiente.';
