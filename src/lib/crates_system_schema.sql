-- Migración: Sistema Integral 360° de Trazabilidad y Control de Canastillas

-- 1. Campos de control en la tabla 'profiles'
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS needs_crates BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS crate_balance INT DEFAULT 0;

COMMENT ON COLUMN profiles.needs_crates IS 'Indica si la cuenta o sucursal tiene configurado el préstamo de canastillas';
COMMENT ON COLUMN profiles.crate_balance IS 'Saldo vivo de canastillas plásticas prestadas actualmente en manos de la sucursal';

-- 2. Tabla Kardex Maestro de Movimientos de Canastillas
CREATE TABLE IF NOT EXISTS crates_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    movement_type VARCHAR NOT NULL, -- 'delivery_loan', 'driver_pickup', 'plant_return', 'direct_return', 'damage_writeoff', 'loss_adjustment'
    quantity INT NOT NULL,
    photo_evidence_url TEXT,
    notes TEXT,
    created_by UUID
);

-- 3. Tabla de Control de Canastillas a Nivel de Camión por Ruta
CREATE TABLE IF NOT EXISTS route_crate_summary (
    route_id UUID PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
    initial_crates_loaded INT DEFAULT 0,
    crates_left_at_clients INT DEFAULT 0,
    crates_picked_up INT DEFAULT 0,
    crates_returned_to_plant INT DEFAULT 0,
    status VARCHAR DEFAULT 'in_transit', -- 'in_transit', 'pending_clearance', 'cleared'
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Políticas de Seguridad (RLS)
ALTER TABLE crates_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_crate_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select for crates_ledger" ON crates_ledger;
CREATE POLICY "Allow public select for crates_ledger" ON crates_ledger FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for crates_ledger" ON crates_ledger;
CREATE POLICY "Allow public insert for crates_ledger" ON crates_ledger FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for crates_ledger" ON crates_ledger;
CREATE POLICY "Allow public update for crates_ledger" ON crates_ledger FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public select for route_crate_summary" ON route_crate_summary;
CREATE POLICY "Allow public select for route_crate_summary" ON route_crate_summary FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for route_crate_summary" ON route_crate_summary;
CREATE POLICY "Allow public insert for route_crate_summary" ON route_crate_summary FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for route_crate_summary" ON route_crate_summary;
CREATE POLICY "Allow public update for route_crate_summary" ON route_crate_summary FOR UPDATE USING (true);
