-- 1. Agregar columna de Variantes a la tabla de Productos
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;
-- Ejemplo de estructura: [{"name": "Tamaño", "options": ["Pequeño", "Grande"]}, {"name": "Maduración", "options": ["Verde", "Pintón"]}]

-- 2. Agregar columna de Opciones Seleccionadas a los Items del Pedido
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS selected_options JSONB DEFAULT '{}'::jsonb;

-- 3. SEED: Configurar variantes para algunos productos clave (Ejemplo de la imagen)

-- Lulo: Tamaño y Maduración
UPDATE products 
SET variants = '[
    {"name": "Tamaño", "options": ["Pequeño", "Mediano", "Grande"]},
    {"name": "Maduración", "options": ["Verde", "Pintón", "Maduro"]}
]'::jsonb
WHERE name ILIKE '%Lulo%';

-- Aguacate: Maduración
UPDATE products 
SET variants = '[
    {"name": "Maduración", "options": ["Verde", "Jecho", "Maduro"]},
    {"name": "Calibre", "options": ["12", "14", "16"]}
]'::jsonb
WHERE name ILIKE '%Aguacate%';

-- Papaya: Solo Maduración
UPDATE products 
SET variants = '[
    {"name": "Maduración", "options": ["Verde", "Pintón", "Maduro"]}
]'::jsonb
WHERE name ILIKE '%Papaya%';

-- Banano: Maduración
UPDATE products 
SET variants = '[
    {"name": "Estado", "options": ["Verde", "Amarillo"]}
]'::jsonb
WHERE name ILIKE '%Banano%';
