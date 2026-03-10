-- 1. REPAIR TABLE STRUCTURE (Ensure all columns from frontend exist)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES pricing_models(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS model_snapshot_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT UNIQUE;

-- 2. TRACEABILITY SYSTEM (Sequence & Professional ID)
CREATE SEQUENCE IF NOT EXISTS quotes_num_seq START 1;

CREATE OR REPLACE FUNCTION set_quote_number() RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
    year_val TEXT;
BEGIN
    -- Get next sequence value
    seq_val := nextval('quotes_num_seq');
    -- Get current year
    year_val := to_char(NOW(), 'YYYY');
    
    -- Format: COT-2024-0001 (Professional tracing number)
    NEW.quote_number := 'COT-' || year_val || '-' || lpad(seq_val::text, 4, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. APPLY TRIGGER
DROP TRIGGER IF EXISTS trigger_set_quote_number ON quotes;
CREATE TRIGGER trigger_set_quote_number
    BEFORE INSERT ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION set_quote_number();

-- 4. BACKFILL EXISTING
UPDATE quotes SET quote_number = 'COT-' || to_char(COALESCE(created_at, NOW()), 'YYYY') || '-' || lpad(nextval('quotes_num_seq')::text, 4, '0')
WHERE quote_number IS NULL;

-- 5. RELOAD SCHEMA CACHE (Very Important for PostgREST)
-- Sometimes notifications are slow, this is the official method
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 'Reparación completa: Columnas client_id, model_id y trazabilidad COT- activadas' as result;
