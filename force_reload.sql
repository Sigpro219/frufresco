-- Force schema cache reload by touching the schema
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS _force_refresh INTEGER;
ALTER TABLE purchases DROP COLUMN _force_refresh;

-- Re-assert existing columns
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS pickup_completed_at TIMESTAMP WITH TIME ZONE;

-- Notify PostgREST explicitly
NOTIFY pgrst, 'reload schema';
