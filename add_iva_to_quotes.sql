-- MIGRACIÓN PARA IVA EN COTIZACIONES
-- Este script prepara la base de datos para guardar cotizaciones con desglose de impuestos.

-- 1. Tabla Principal: Guardar el resumen de la factura
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total_tax_amount NUMERIC DEFAULT 0;
-- Nota: 'total_amount' ya existe y será el Gran Total (Subtotal + Impuestos)

-- 2. Tabla de Detalles: Guardar el impuesto cobrado por cada producto en ese momento
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC DEFAULT 19;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS iva_amount NUMERIC DEFAULT 0;

-- 3. Recargar el caché de Supabase
NOTIFY pgrst, 'reload schema';

SELECT 'Migración de IVA en cotizaciones exitosa' as result;
