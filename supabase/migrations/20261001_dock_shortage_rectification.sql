-- ==============================================================================
-- Migración: Soporte para Novedades de Escasez en Rectificación de Cargue LIFO
-- FruFresco - Compuerta Shift-Left en Muelle (SDD v1.9.70)
-- ==============================================================================

-- 1. Bandera indicadora de faltantes en la ruta
ALTER TABLE public.routes 
    ADD COLUMN IF NOT EXISTS has_shortages BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shortages_summary JSONB DEFAULT '[]'::jsonb;

-- 2. Asegurar índices para rápida conciliación entre pedidos, calidad y devoluciones
CREATE INDEX IF NOT EXISTS idx_routes_has_shortages ON public.routes(has_shortages);
CREATE INDEX IF NOT EXISTS idx_billing_returns_order_id ON public.billing_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_service_pqrs_order_id ON public.customer_service_pqrs(order_id);

-- 3. Documentación técnica
COMMENT ON COLUMN public.routes.has_shortages IS 'True si la ruta fue certificada con faltantes por escasez o agotados en muelle';
COMMENT ON COLUMN public.routes.shortages_summary IS 'Resumen estructurado en JSONB de los productos no alistados por escasez durante la rectificación';
