-- Agregar secuencia para IDs amigables
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS sequence_id SERIAL;

-- Opcional: Si quieres que empiece en 1 (ya empieza en 1 por defecto al ser SERIAL)
-- Si la tabla ya tiene datos, los números se asignarán automáticamente a las filas existentes.
