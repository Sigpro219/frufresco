-- 1. Ensure column exists
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS pickup_completed_at TIMESTAMP WITH TIME ZONE;

-- 2. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
