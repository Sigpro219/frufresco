-- Migration to add Geolocation fields for Intelligent Routing
-- Table: profiles

DO $$ 
BEGIN
    -- Add latitude
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'latitude') THEN
        ALTER TABLE profiles ADD COLUMN latitude DOUBLE PRECISION;
    END IF;

    -- Add longitude
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'longitude') THEN
        ALTER TABLE profiles ADD COLUMN longitude DOUBLE PRECISION;
    END IF;

    -- Add geocoding_status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'geocoding_status') THEN
        ALTER TABLE profiles ADD COLUMN geocoding_status TEXT DEFAULT 'pending'; -- pending, success, failed
    END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
