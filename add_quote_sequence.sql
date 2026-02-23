-- Add Readable ID to Quotes
-- 1. Create a sequence
CREATE SEQUENCE IF NOT EXISTS quotes_id_seq START 1;

-- 2. Add the column
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;

-- 3. Create the Function to generate the ID
CREATE OR REPLACE FUNCTION set_quote_number() RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
BEGIN
    -- Get next value
    seq_val := nextval('quotes_id_seq');
    -- Format: DDMM_0001 (pads with zeros to 4 digits)
    -- Uses the created_at date (or NOW() if null)
    NEW.quote_number := to_char(COALESCE(NEW.created_at, NOW()), 'DDMM') || '_' || lpad(seq_val::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create the Trigger
DROP TRIGGER IF EXISTS trigger_set_quote_number ON quotes;
CREATE TRIGGER trigger_set_quote_number
    BEFORE INSERT ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION set_quote_number();

-- 5. Backfill existing quotes (optional, giving them IDs based on created_at)
-- This might be tricky if order matters, but let's try a simple update for nulls
UPDATE quotes 
SET quote_number = to_char(created_at, 'DDMM') || '_' || lpad(nextval('quotes_id_seq')::text, 4, '0')
WHERE quote_number IS NULL;
