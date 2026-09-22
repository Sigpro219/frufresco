-- Migración: Tabla de Cierre Diario Oficial y Congelación Contable de Inventario
-- Contrato SDD SPEC.md v1.5.0

CREATE TABLE IF NOT EXISTS daily_inventory_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_date DATE NOT NULL UNIQUE,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by_user_id UUID,
    closed_by_name TEXT,
    notes TEXT,
    total_calculated NUMERIC DEFAULT 0,
    total_physical NUMERIC DEFAULT 0,
    total_missing NUMERIC DEFAULT 0,
    total_surplus NUMERIC DEFAULT 0,
    is_locked BOOLEAN DEFAULT true,
    snapshot_items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE daily_inventory_closings ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura e inserción para usuarios autenticados
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'daily_inventory_closings' AND policyname = 'Allow authenticated read daily_inventory_closings'
    ) THEN
        CREATE POLICY "Allow authenticated read daily_inventory_closings"
            ON daily_inventory_closings FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'daily_inventory_closings' AND policyname = 'Allow authenticated insert daily_inventory_closings'
    ) THEN
        CREATE POLICY "Allow authenticated insert daily_inventory_closings"
            ON daily_inventory_closings FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'daily_inventory_closings' AND policyname = 'Allow authenticated update daily_inventory_closings'
    ) THEN
        CREATE POLICY "Allow authenticated update daily_inventory_closings"
            ON daily_inventory_closings FOR UPDATE TO authenticated USING (true);
    END IF;
END $$;
