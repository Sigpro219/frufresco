-- Añadir columna show_on_web a la tabla products
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_on_web BOOLEAN DEFAULT true;

-- Comentario para documentación
COMMENT ON COLUMN products.show_on_web IS 'Indica si el producto es visible en la tienda web pública';
