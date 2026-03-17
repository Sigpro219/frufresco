-- Migración para añadir el campo de IVA a los productos
-- Paso 1: Añadir la columna con un valor por defecto de 19
ALTER TABLE products ADD COLUMN IF NOT EXISTS iva_rate INTEGER DEFAULT 19;

-- Paso 2: Asegurar que todos los registros actuales tengan el 19% si por alguna razón quedaron nulos
UPDATE products SET iva_rate = 19 WHERE iva_rate IS NULL;

-- Paso 3: (Opcional) Si quieres que sea obligatorio en el futuro
-- ALTER TABLE products ALTER COLUMN iva_rate SET NOT NULL;
