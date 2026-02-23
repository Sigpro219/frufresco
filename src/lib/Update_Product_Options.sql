-- Añadir columna de opciones (variantes) a la tabla de productos
ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb;

-- Actualizar producto "Fresa" con opciones del ejemplo
UPDATE products 
SET options = '{
  "Presentación": ["Libra (500 gramos)", "Media libra (250 gramos)"],
  "Variedad": ["Jumbo", "Mediana", "Richy"],
  "Maduración": ["Maduro", "Pintón", "Verde", "Mitad verde / Mitad maduro"]
}'::jsonb
WHERE name ILIKE '%Fresa%';

-- Actualizar otros productos con opciones genéricas para demo
UPDATE products 
SET options = '{
  "Presentación": ["Unidad", "Bolsa x 3"],
  "Maduración": ["Maduro", "Verde"]
}'::jsonb
WHERE category IN ('Frutas', 'Verduras') AND options = '{}'::jsonb;
