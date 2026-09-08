-- ==============================================================================
-- MIGRACIÓN: Módulo de Atención al Cliente & Causa Raíz (RCA Lean)
-- Tablas: customer_service_pqrs, billing_returns
-- ==============================================================================

-- 1. Agregar columnas de Causa Raíz e Imputabilidad en customer_service_pqrs
ALTER TABLE public.customer_service_pqrs 
    ADD COLUMN IF NOT EXISTS defect_category_l1 TEXT,
    ADD COLUMN IF NOT EXISTS defect_subtype_l2 TEXT,
    ADD COLUMN IF NOT EXISTS imputed_responsible TEXT,
    ADD COLUMN IF NOT EXISTS imputation_evidence_notes TEXT,
    ADD COLUMN IF NOT EXISTS is_replacement_rejection BOOLEAN DEFAULT FALSE;

-- 2. Agregar columnas equivalentes en billing_returns
ALTER TABLE public.billing_returns 
    ADD COLUMN IF NOT EXISTS defect_category_l1 TEXT,
    ADD COLUMN IF NOT EXISTS defect_subtype_l2 TEXT,
    ADD COLUMN IF NOT EXISTS imputed_responsible TEXT,
    ADD COLUMN IF NOT EXISTS is_replacement_rejection BOOLEAN DEFAULT FALSE;

-- 3. Índices para agilizar el Dashboard de Causa Raíz y agregaciones
CREATE INDEX IF NOT EXISTS idx_pqr_rca_category ON public.customer_service_pqrs(defect_category_l1);
CREATE INDEX IF NOT EXISTS idx_pqr_rca_responsible ON public.customer_service_pqrs(imputed_responsible);
CREATE INDEX IF NOT EXISTS idx_pqr_replacement_rejection ON public.customer_service_pqrs(is_replacement_rejection);

CREATE INDEX IF NOT EXISTS idx_returns_rca_responsible ON public.billing_returns(imputed_responsible);
CREATE INDEX IF NOT EXISTS idx_returns_replacement_rejection ON public.billing_returns(is_replacement_rejection);

-- 4. Comentarios de documentación técnica
COMMENT ON COLUMN public.customer_service_pqrs.defect_category_l1 IS 'Categoría L1: fisiologia_maduracion, dano_mecanico, fitopatologia, cadena_frio, calibre_especificacion, error_montaje_pedido, comercial_cliente';
COMMENT ON COLUMN public.customer_service_pqrs.defect_subtype_l2 IS 'Subtipo L2 específico (ej: sobremaduro, aplastamiento_sobreestiba, sku_equivocado_captura, etc.)';
COMMENT ON COLUMN public.customer_service_pqrs.imputed_responsible IS 'Responsable Imputable: proveedor, bodega, picking, transporte, comercial, cliente';
COMMENT ON COLUMN public.customer_service_pqrs.is_replacement_rejection IS 'Bandera anti-ping-pong: True si el rechazo ocurrió sobre una reposición previa';
