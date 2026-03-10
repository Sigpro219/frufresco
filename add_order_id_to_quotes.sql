-- MIGRACIÓN PARA TRAZABILIDAD DE PEDIDOS DESDE COTIZACIONES
-- Este script permite que una cotización guarde el ID del pedido que se generó a partir de ella.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);

NOTIFY pgrst, 'reload schema';

SELECT 'Columna order_id agregada con éxito' as result;
