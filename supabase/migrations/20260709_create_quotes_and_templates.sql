-- Migration: Create CRM Quotes, Quote Items, and Templates
-- Path: supabase/migrations/20260709_create_quotes_and_templates.sql

-- 1. Create table for Quote Templates (Preformas)
CREATE TABLE IF NOT EXISTS quote_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create table for Quote Template Items
CREATE TABLE IF NOT EXISTS quote_template_items (
    template_id UUID REFERENCES quote_templates(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (template_id, product_id)
);

-- 3. Create table for Quotes (Cotizaciones / Acuerdos)
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number SERIAL UNIQUE,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    model_id UUID REFERENCES pricing_models(id) ON DELETE SET NULL,
    model_snapshot_name TEXT,
    subtotal_amount NUMERIC NOT NULL,
    total_tax_amount NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'draft', -- draft, sent, accepted, agreement, expired, rejected
    start_date DATE DEFAULT CURRENT_DATE,
    valid_until DATE, -- Expiration date of the contract / quote validity
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create table for Quote Items (Detalle de Cotización)
CREATE TABLE IF NOT EXISTS quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    cost_basis NUMERIC NOT NULL,
    margin_percent NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    iva_rate NUMERIC NOT NULL,
    iva_amount NUMERIC NOT NULL,
    total_price NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Allow authenticated users to select templates
CREATE POLICY "Allow authenticated read to templates" ON quote_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read to template items" ON quote_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read to quotes" ON quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read to quote items" ON quote_items FOR SELECT TO authenticated USING (true);

-- Allow staff/admin full access
CREATE POLICY "Allow staff write to templates" ON quote_templates FOR ALL TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff')
);
CREATE POLICY "Allow staff write to template items" ON quote_template_items FOR ALL TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff')
);
CREATE POLICY "Allow staff write to quotes" ON quotes FOR ALL TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff')
);
CREATE POLICY "Allow staff write to quote items" ON quote_items FOR ALL TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff')
);

-- 7. Alter mail table to add inbound routing columns
ALTER TABLE mail ADD COLUMN IF NOT EXISTS is_inbound BOOLEAN DEFAULT false;
ALTER TABLE mail ADD COLUMN IF NOT EXISTS inbox_type TEXT DEFAULT 'outbox';
