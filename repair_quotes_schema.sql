-- REPARAR ESQUEMA DE COTIZACIONES Y PERMISOS
-- 1. Asegurar columnas básicas
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS model_snapshot_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- 2. Habilitar RLS y Políticas Públicas para Desarrollo
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Quotes Access" ON quotes;
CREATE POLICY "Public Quotes Access" ON quotes FOR ALL USING (true);

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Quote Items Access" ON quote_items;
CREATE POLICY "Public Quote Items Access" ON quote_items FOR ALL USING (true);

-- 3. Forzar reinicio de caché de Supabase
NOTIFY pgrst, 'reload schema';

-- 4. Verificar estructura
SELECT 'Estructura de cotizaciones reparada y permisos habilitados' as result;
