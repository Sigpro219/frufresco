-- SISTEMA DE EQUIVALENCIAS DE UNIDADES
-- Permite comprar en bultos/cajas y registrar en kg/unidades.

CREATE TABLE IF NOT EXISTS product_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) NOT NULL,
    from_unit TEXT NOT NULL, -- Ej: 'Bulto'
    to_unit TEXT NOT NULL,   -- Ej: 'Kg'
    conversion_factor DECIMAL NOT NULL, -- Ej: 50
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, from_unit, to_unit)
);

-- Habilitar RLS
ALTER TABLE product_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total para desarrollo" ON product_conversions FOR ALL USING (true);

-- Semilla inicial para Papas (Si existen en la tabla de productos)
-- Buscamos productos que contengan 'Papa' y les asignamos que 1 Bulto = 50 Kg
INSERT INTO product_conversions (product_id, from_unit, to_unit, conversion_factor)
SELECT id, 'Bulto', 'Kg', 50
FROM products
WHERE name ILIKE '%papa%'
ON CONFLICT DO NOTHING;
