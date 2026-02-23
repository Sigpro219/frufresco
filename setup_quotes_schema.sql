-- TABLA DE COTIZACIONES (QUOTES)
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL, -- Flexible para prospectos
    profile_id UUID REFERENCES profiles(id), -- Opcional, si ya es cliente registrado
    model_id UUID REFERENCES pricing_models(id),
    model_snapshot_name TEXT, -- Guardamos el nombre del modelo al momento de cotizar (ej: "A1")
    status TEXT CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'converted')) DEFAULT 'draft',
    total_amount NUMERIC DEFAULT 0,
    valid_until DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA DE ITEMS DE COTIZACIÓN
CREATE TABLE IF NOT EXISTS quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id), -- Corregido a UUID
    product_name TEXT, -- Snapshot nombre
    quantity NUMERIC NOT NULL,
    unit TEXT, -- Unidad de medida
    cost_basis NUMERIC, -- El costo que se usó para calcular (Snapshot para auditoría de margen)
    margin_percent NUMERIC, -- Margen aplicado
    unit_price NUMERIC, -- Precio final ofrecido
    total_price NUMERIC
);

-- RLS (POLITICAS DE SEGURIDAD BASICAS)
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- Permitir todo a roles autenticados por ahora (Admin Dashboard)
CREATE POLICY "Enable all for authenticated users on quotes" ON quotes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users on quote_items" ON quote_items FOR ALL USING (auth.role() = 'authenticated');
