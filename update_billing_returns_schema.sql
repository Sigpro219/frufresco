-- ==============================================================================
-- Migración FruFresco: Soporte para Retorno Físico a Bodega y RCA en billing_returns
-- SDD v1.9.87 - Sección 30.4.3
-- ==============================================================================

ALTER TABLE billing_returns 
ADD COLUMN IF NOT EXISTS has_physical_return BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS defect_category_l1 TEXT,
ADD COLUMN IF NOT EXISTS defect_subtype_l2 TEXT,
ADD COLUMN IF NOT EXISTS imputed_responsible TEXT,
ADD COLUMN IF NOT EXISTS imputation_evidence_notes TEXT;

-- Índice para consultas operativas de patio en cuarentena
CREATE INDEX IF NOT EXISTS idx_billing_returns_physical_quarantine 
ON billing_returns(status, has_physical_return) 
WHERE has_physical_return = true;
