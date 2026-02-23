-- SQL para agregar el nuevo estado al ENUM de pedidos
-- Ejecutar esto en el SQL Editor de Supabase

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'order_status' AND e.enumlabel = 'para_compra'
    ) THEN
        ALTER TYPE order_status ADD VALUE 'para_compra';
    END IF;
END
$$;

-- Verificar los valores actuales
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'order_status'::regtype;
