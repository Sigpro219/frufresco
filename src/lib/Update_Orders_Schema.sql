-- Adición de campos de contacto para pedidos (especialmente para Guest Checkout)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Comentario para recordar el propósito
COMMENT ON COLUMN orders.customer_name IS 'Nombre del cliente (usado en Guest Checkout)';
COMMENT ON COLUMN orders.customer_email IS 'Email del cliente para notificaciones';
COMMENT ON COLUMN orders.customer_phone IS 'Teléfono de contacto para logística';
