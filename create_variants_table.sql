-- 1. Crear tabla dedicada para Variantes (mejor que JSONB)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT UNIQUE NOT NULL,
    options JSONB NOT NULL, -- Ej: {"Tamaño": "Grande", "Maduración": "Pintón"}
    image_url TEXT,
    price_adjustment_percent NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexar para velocidad
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);

-- 3. Habilitar RLS (Seguridad)
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acceso (Lectura/Escritura para todos por ahora en dev)
DROP POLICY IF EXISTS "Public Read Product Variants" ON product_variants;
CREATE POLICY "Public Read Product Variants" ON product_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin All Product Variants" ON product_variants;
CREATE POLICY "Admin All Product Variants" ON product_variants FOR ALL USING (true);

-- 5. Limpieza opcional: Podríamos querer migrar datos de products.variants a esta tabla,
-- pero como el usuario dice que "no guardan", asumimos que está vacía en JSONB.
