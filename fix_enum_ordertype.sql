-- Asegurar que 'b2c' sea un tipo de orden válido
ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'b2c';

-- Asegurar nuevamente columns por si el script anterior falló o no se corrió
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS origin_source TEXT DEFAULT 'phone';
