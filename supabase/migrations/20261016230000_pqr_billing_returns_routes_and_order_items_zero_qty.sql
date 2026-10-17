-- ============================================================================
-- MIGRACIÓN SDD v1.9.213 (Escenario 244):
-- 1. Columnas de auditoría World Office en public.billing_returns
-- 2. Columna driver_name en public.routes para trazabilidad de conductores
-- 3. Relajación de check_order_items_quantity_realistic (quantity >= 0)
--    para soportar devoluciones del 100% en Ajustes de Factura PQR (Opción 4)
-- ============================================================================

-- 1. Columnas faltantes en public.billing_returns
ALTER TABLE public.billing_returns
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_note_number TEXT,
  ADD COLUMN IF NOT EXISTS reference_invoice_number TEXT;

-- 2. Columna driver_name en public.routes
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- Backfill de driver_name en rutas existentes desde profiles
UPDATE public.routes r
SET driver_name = COALESCE(p.company_name, p.contact_name, p.email)
FROM public.profiles p
WHERE r.driver_id = p.id
  AND r.driver_name IS NULL;

-- 3. Sincronización de devoluciones vinculadas a PQRs ya resueltas
UPDATE public.billing_returns br
SET
  status = 'approved',
  resolved_at = COALESCE(br.resolved_at, pqr.resolved_at, NOW())
FROM public.customer_service_pqrs pqr
WHERE br.order_id = pqr.order_id
  AND pqr.status = 'resolved'
  AND br.status = 'pending_review';

-- 4. Permitir quantity = 0 en order_items cuando una línea es descontada al 100% por Ajuste de Factura PQR
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS check_order_items_quantity_realistic;

ALTER TABLE public.order_items
  ADD CONSTRAINT check_order_items_quantity_realistic
  CHECK (quantity >= 0) NOT VALID;
