-- Migration to link clients (profiles) with pricing models
-- Table: profiles

DO $$ 
BEGIN
    -- Add pricing_model_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pricing_model_id') THEN
        ALTER TABLE profiles ADD COLUMN pricing_model_id UUID REFERENCES pricing_models(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
