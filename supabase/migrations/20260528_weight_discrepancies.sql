-- Crear tabla de control de discrepancias de peso / excedentes
CREATE TABLE IF NOT EXISTS weight_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    expected_quantity DECIMAL(10,2) NOT NULL, -- picked_quantity o quantity original
    received_quantity DECIMAL(10,2) NOT NULL, -- Lo ingresado en báscula
    excess_quantity DECIMAL(10,2) GENERATED ALWAYS AS (received_quantity - expected_quantity) STORED,
    status TEXT DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected')),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    supervisor_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS en la nueva tabla
ALTER TABLE weight_discrepancies ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para weight_discrepancies
DROP POLICY IF EXISTS "Public read weight_discrepancies" ON weight_discrepancies;
CREATE POLICY "Public read weight_discrepancies" ON weight_discrepancies 
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisor full access weight_discrepancies" ON weight_discrepancies;
CREATE POLICY "Supervisor full access weight_discrepancies" ON weight_discrepancies 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
