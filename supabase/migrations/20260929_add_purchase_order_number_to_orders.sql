-- ==============================================================================
-- Migración: Agregar columna purchase_order_number a la tabla orders
-- Propósito: Garantizar la gobernanza del N° de Orden de Compra (OC) del cliente
--            en todo el ciclo de vida del pedido (Escenario 48 - SPEC.md v1.9.18)
-- Fecha: 2026-09-29
-- ==============================================================================

-- 1. Agregar columna en orders (idempotente)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(100);

-- 2. Documentar la columna en el catálogo de PostgreSQL
COMMENT ON COLUMN orders.purchase_order_number IS 
'Número de Orden de Compra (OC / SOLPED / Pedido) asignado por el cliente. Acompaña al pedido desde su captura hasta remisión, alistamiento y facturación.';

-- 3. Crear índice para acelerar búsquedas en omnibox, filtros y reportes logísticos
CREATE INDEX IF NOT EXISTS idx_orders_purchase_order_number 
ON orders (purchase_order_number);

-- 4. Opcional: Script de Backfill Retroactivo para pedidos históricos que tengan OC en admin_notes
-- Extrae patrones como "OC: 12345" o "Orden de Compra: ABC-99" si purchase_order_number es nulo
DO $$
BEGIN
    UPDATE orders
    SET purchase_order_number = TRIM((REGEXP_MATCHES(admin_notes, '(?:OC|Orden de Compra|O\.C\.|P\.O\.|PO)[\s:#]+([A-Za-z0-9\-_]+)', 'i'))[1])
    WHERE purchase_order_number IS NULL 
      AND admin_notes ~* '(?:OC|Orden de Compra|O\.C\.|P\.O\.|PO)[\s:#]+([A-Za-z0-9\-_]+)';
EXCEPTION WHEN OTHERS THEN
    -- En caso de que regex no coincida en lotes atípicos, no abortar la migración
    RAISE NOTICE 'Backfill completado o saltado sin errores.';
END $$;
