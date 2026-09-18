-- ==============================================================================
-- MIGRACIÓN DE TRAZABILIDAD Y AUTORÍA FORMAL EN ACUERDOS COMERCIALES Y PRECIOS
-- ==============================================================================
-- Propósito: Formalizar a nivel relacional la autoría de los acuerdos y precios
-- congelados en FruFresco, garantizando integridad referencial y persistencia.
-- ==============================================================================

-- 1. AGREGAR COLUMNAS DE AUTORÍA EN TABLA PRINCIPAL (quotes)
ALTER TABLE quotes 
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by_name TEXT,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by_name TEXT;

COMMENT ON COLUMN quotes.created_by IS 'ID de auth.users del colaborador que estructuró el acuerdo comercial';
COMMENT ON COLUMN quotes.created_by_name IS 'Nombre legible del colaborador autor para visualización rápida';

-- 2. AGREGAR COLUMNAS DE AUDITORÍA ATÓMICA EN DETALLE DE PRODUCTOS (quote_items)
ALTER TABLE quote_items 
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN quote_items.updated_by IS 'Colaborador que modificó por última vez el precio unitario de este producto';

-- 3. BACKFILL HISTÓRICO: ASOCIAR ACUERDOS BASE EXISTENTES A JULISSA ARÉVALO EN quotes
UPDATE quotes
SET 
    created_by = (SELECT id FROM auth.users WHERE email = 'e.julissaa@gmail.com' LIMIT 1),
    created_by_name = 'Julissa Arévalo Ramirez',
    updated_by = (SELECT id FROM auth.users WHERE email = 'e.julissaa@gmail.com' LIMIT 1),
    updated_by_name = 'Julissa Arévalo Ramirez'
WHERE created_by IS NULL;

-- 4. BACKFILL EN LIBRO CONTABLE DE AUDITORÍA (audit_logs)
-- Nota técnica: audit_logs.collaborator_id tiene Foreign Key estricta hacia la tabla collaborators(id).
-- Obtenemos dinámicamente el id de Julissa desde collaborators (document_id = '52346672'):
INSERT INTO audit_logs (
    created_at,
    collaborator_id,
    collaborator_name,
    action,
    module,
    details
)
SELECT 
    q.created_at,
    c.id AS collaborator_id,
    'AREVALO RAMIREZ JULISSA CENAIDA' AS collaborator_name,
    'CREATE_institutional_agreement' AS action,
    'COMMERCIAL' AS module,
    jsonb_build_object(
        'quote_id', q.id,
        'quote_number', q.quote_number,
        'client_name', q.client_name,
        'model_name', q.model_snapshot_name,
        'author_document', '52346672',
        'note', 'Cargue histórico inicial de modelo de precios institucional'
    ) AS details
FROM quotes q
CROSS JOIN (
    SELECT id 
    FROM collaborators 
    WHERE document_id = '52346672' OR email = 'e.julissaa@gmail.com' 
    LIMIT 1
) c
WHERE NOT EXISTS (
    SELECT 1 FROM audit_logs al 
    WHERE (al.details->>'quote_id' = q.id::text OR al.details->>'quoteId' = q.id::text)
      AND al.action IN ('CREATE_institutional_agreement', 'UPLOAD_MASTER_INSTITUTIONAL_TEMPLATE')
);

-- 5. REFRESCAR CACHÉ DE POSTGREST
NOTIFY pgrst, 'reload schema';

SELECT 'Migración de autoría institucional en quotes y quote_items ejecutada con éxito' AS resultado;
