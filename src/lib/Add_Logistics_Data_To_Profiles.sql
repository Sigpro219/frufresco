-- Migration to add logistics_data field to profiles table for Route Optimization
-- This stores the JSON structure with windows and allowed days

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'logistics_data') THEN
        ALTER TABLE profiles ADD COLUMN logistics_data JSONB;
        COMMENT ON COLUMN profiles.logistics_data IS 'JSON structured logistics restrictions for Google Route Optimization';
    END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
