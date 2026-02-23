-- Migration to add Department and Municipality to client profiles
-- Table: profiles

DO $$ 
BEGIN
    -- Add department
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'department') THEN
        ALTER TABLE profiles ADD COLUMN department TEXT;
    END IF;

    -- Add municipality
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'municipality') THEN
        ALTER TABLE profiles ADD COLUMN municipality TEXT;
    END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
