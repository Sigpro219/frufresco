-- 1. ASEGURAR QUE LA COLUMNA 'OPTIONS' EXISTA
ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb;

-- 2. CONFIGURACIÓN DE VARIANTES PARA TOMATE CHONTO
UPDATE products 
SET 
  options = '{
    "Tamaño": ["Pequeño (Guiso)", "Mediano (Ensalada)", "Grande (Exportación)"],
    "Maduración": ["Verde", "Pintón", "Maduro", "Muy Maduro (Salsa)"]
  }'::jsonb,
  image_url = 'https://images.unsplash.com/photo-1518977676601-b53f82a6b6dc?auto=format&fit=crop&w=800&q=80',
  description = 'Tomate Chonto de campo, seleccionado por calibre y grado de madurez para garantizar el mejor rendimiento en tu cocina.'
WHERE name ILIKE '%Tomate%';
