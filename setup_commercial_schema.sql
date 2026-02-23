-- REINICIO TOTAL DEL ESQUEMA COMERCIAL
-- OJO: Esto borrará los datos de modelos y reglas si ya existían para garantizar la estructura correcta.

-- 1. LIMPIEZA PREVIA
DROP TABLE IF EXISTS inventory_entries CASCADE;
DROP TABLE IF EXISTS pricing_rules CASCADE;
DROP TABLE IF EXISTS pricing_models CASCADE;
DROP FUNCTION IF EXISTS get_product_average_cost;

-- 2. TABLA DE MODELOS DE PRECIOS
CREATE TABLE pricing_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    base_margin_percent NUMERIC(5,2) DEFAULT 20.00, -- Margen base general
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE REGLAS ESPECÍFICAS
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES pricing_models(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    margin_adjustment NUMERIC(5,2) DEFAULT 0.00, -- Ej: +3.00 o -2.00
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA DE ENTRADAS DE INVENTARIO (COSTOS)
CREATE TABLE inventory_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(10,2) NOT NULL,
    unit_cost NUMERIC(10,2) NOT NULL,
    entry_date TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) -- Opcional, puede ser null
);

-- 5. FUNCIÓN DE COSTO PROMEDIO
CREATE OR REPLACE FUNCTION get_product_average_cost(p_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    avg_cost NUMERIC;
BEGIN
    SELECT AVG(unit_cost)
    INTO avg_cost
    FROM (
        SELECT unit_cost
        FROM inventory_entries
        WHERE product_id = p_id
        ORDER BY entry_date DESC
        LIMIT 5
    ) AS last_entries;

    RETURN COALESCE(avg_cost, 0);
END;
$$ LANGUAGE plpgsql;

-- 6. POLÍTICAS RLS (Seguridad Básica)
ALTER TABLE pricing_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Pricing Access" ON pricing_models FOR ALL USING (true);

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Rules Access" ON pricing_rules FOR ALL USING (true);

ALTER TABLE inventory_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Inventory Access" ON inventory_entries FOR ALL USING (true);

-- 7. DATOS DE SEMILLA
INSERT INTO pricing_models (name, base_margin_percent, description)
VALUES 
    ('Restaurante Grande', 15.00, 'Alta rotación, menor margen'),
    ('Restaurante Pequeño', 25.00, 'Baja rotación, margen estándar'),
    ('Colegio', 20.00, 'Contratos fijos anuales'),
    ('Hotel', 30.00, 'Servicio premium, entrega nocturna'),
    ('Ancianato', 18.00, 'Presupuesto ajustado');

-- Notificación de éxito
SELECT 'Estructura comercial creada exitosamente' as result;
