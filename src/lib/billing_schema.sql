
-- BILLING SYSTEM SETUP (MÓDULO DE FACTURACIÓN)

-- 1. Billing Cuts (Cortes de facturación)
-- Maneja la agrupación de pedidos por franjas horarias (AM/PM)
CREATE TABLE IF NOT EXISTS billing_cuts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cut_number SERIAL,
    scheduled_date DATE DEFAULT CURRENT_DATE,
    cut_slot TEXT CHECK (cut_slot IN ('AM', 'PM', 'ADJ')), -- ADJ para ajustes posteriores
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'processing', 'closed', 'exported')),
    total_orders INTEGER DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    exported_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- 2. Billing Returns (Gestión de devoluciones desde conductor)
-- Captura lo que el transportador marca como devolución
CREATE TABLE IF NOT EXISTS billing_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity_returned DECIMAL(10,2) NOT NULL,
    reason TEXT,
    photo_url TEXT,
    status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'processed')),
    reviewed_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Invoices (Documentos/Registros de facturación)
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    cut_id UUID REFERENCES billing_cuts(id),
    invoice_number TEXT UNIQUE, -- Formato ej: FE-0001
    total_base DECIMAL(15,2),
    total_tax DECIMAL(15,2),
    total_final DECIMAL(15,2),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'printed', 'exported', 'cancelled')),
    worldoffice_sync_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Billing Audit (Auditoría de modificaciones)
CREATE TABLE IF NOT EXISTS billing_modifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    billing_cut_id UUID REFERENCES billing_cuts(id),
    modified_by UUID REFERENCES auth.users(id),
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Extensiones a tablas existentes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_cut_id UUID REFERENCES billing_cuts(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES billing_invoices(id);

-- 6. RLS (Seguridad)
ALTER TABLE billing_cuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_modifications ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para administración/auxiliar
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_cuts;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_returns;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_invoices;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_modifications;
END $$;

CREATE POLICY "Enable all for authenticated" ON billing_cuts FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated" ON billing_returns FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated" ON billing_invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated" ON billing_modifications FOR ALL TO authenticated USING (true);
