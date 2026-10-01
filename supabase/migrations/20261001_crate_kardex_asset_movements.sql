-- Migration: 20261001_crate_kardex_asset_movements.sql
-- Description: Enriquecimiento de asset_movements y crates_ledger para soporte completo de Kardex de Canastillas en Comodato (4 Actores: Bodega, Conductor, Torre de Control, Cliente B2B)

-- 1. Asegurar columnas relacionales y métricas segregadas en asset_movements
DO $$ 
BEGIN
    -- profile_id (Cliente dueño del comodato / Kardex)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'profile_id'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- order_id (Pedido o remisión de origen)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'order_id'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
    END IF;

    -- delivered_qty (Canastillas llenas entregadas al cliente)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'delivered_qty'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN delivered_qty INTEGER DEFAULT 0;
    END IF;

    -- received_qty (Canastillas vacías recogidas del cliente)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'received_qty'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN received_qty INTEGER DEFAULT 0;
    END IF;

    -- balance_after (Saldo resultante del cliente tras la transacción)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'balance_after'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN balance_after INTEGER;
    END IF;

    -- evidence_url (Foto de remisión firmada o acta de comodato)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'evidence_url'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN evidence_url TEXT;
    END IF;

    -- movement_type (Taxonomía formal: 'delivery_loan', 'driver_pickup', 'yard_direct_return', 'yard_adjustment', 'loss_writeoff', 'initial_count')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_movements' AND column_name = 'movement_type'
    ) THEN
        ALTER TABLE asset_movements ADD COLUMN movement_type TEXT DEFAULT 'delivery_loan';
    END IF;
END $$;

-- 2. Asegurar existencia de la tabla crates_ledger para auditoría global de patio
CREATE TABLE IF NOT EXISTS crates_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type TEXT NOT NULL, -- 'initial_count', 'new_purchase', 'damage_writeoff'
    quantity INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en crates_ledger
ALTER TABLE crates_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'crates_ledger' AND policyname = 'Allow authenticated users full access to crates_ledger'
    ) THEN
        CREATE POLICY "Allow authenticated users full access to crates_ledger" ON crates_ledger
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- 3. Índices de alta velocidad para consultas del Kardex por cliente
CREATE INDEX IF NOT EXISTS idx_asset_movements_profile_id ON asset_movements(profile_id);
CREATE INDEX IF NOT EXISTS idx_asset_movements_order_id ON asset_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_asset_movements_created_at ON asset_movements(created_at DESC);

-- 4. Políticas RLS en asset_movements
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'asset_movements' AND policyname = 'Clients can read their own crate movements'
    ) THEN
        CREATE POLICY "Clients can read their own crate movements" ON asset_movements
            FOR SELECT USING (auth.uid() = profile_id OR auth.role() = 'authenticated');
    END IF;
END $$;
