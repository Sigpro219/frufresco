-- Agregar columna document_url a la tabla orders para almacenar el PDF/documento original de compra
ALTER TABLE orders ADD COLUMN document_url TEXT;

-- Comentario explicativo en la columna
COMMENT ON COLUMN orders.document_url IS 'URL pública del documento original de compra (PDF, Imagen, Excel) cargado para crear el pedido.';
