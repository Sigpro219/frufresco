-- Agregar columna para Franja Horaria de Entrega
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_slot TEXT DEFAULT 'AM'; -- Valores: 'AM', 'PM'

-- Opcional: Agregar un comentario a la columna
COMMENT ON COLUMN orders.delivery_slot IS 'Franja de entrega: AM (Mañana) o PM (Tarde)';
