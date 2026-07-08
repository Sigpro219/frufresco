-- MIGRACIÓN PARA IVA EN ÍTEMS DE PEDIDOS
-- Este script prepara la tabla order_items para guardar el desglose de IVA por ítem.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC DEFAULT 19;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS iva_amount NUMERIC DEFAULT 0;

-- Recargar el caché de Supabase
NOTIFY pgrst, 'reload schema';

SELECT 'Migración de IVA en order_items exitosa' as result;
