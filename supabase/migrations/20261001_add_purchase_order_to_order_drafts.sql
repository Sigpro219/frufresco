-- Migration: Añadir columnas para Orden de Compra (OC / OCC / PO / SOLPED) a la tabla order_drafts
ALTER TABLE public.order_drafts 
ADD COLUMN IF NOT EXISTS purchase_order TEXT,
ADD COLUMN IF NOT EXISTS client_po_number TEXT,
ADD COLUMN IF NOT EXISTS po_number TEXT;

COMMENT ON COLUMN public.order_drafts.purchase_order IS 'Número de Orden de Compra (OC / OCC / PO / SOLPED) detectado en el documento o correo';
COMMENT ON COLUMN public.order_drafts.client_po_number IS 'Número de Orden de Compra canónico del cliente';
COMMENT ON COLUMN public.order_drafts.po_number IS 'Número de Orden de Compra alternativo para compatibilidad';
