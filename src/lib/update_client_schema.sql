-- Migration to enhance client profiles with commercial and logistical fields
-- Table: profiles

DO $$ 
BEGIN
    -- Add nit if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'nit') THEN
        ALTER TABLE profiles ADD COLUMN nit TEXT;
    END IF;

    -- Add razon_social
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'razon_social') THEN
        ALTER TABLE profiles ADD COLUMN razon_social TEXT;
    END IF;

    -- Add city
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'city') THEN
        ALTER TABLE profiles ADD COLUMN city TEXT;
    END IF;

    -- Add address
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'address') THEN
        ALTER TABLE profiles ADD COLUMN address TEXT;
    END IF;

    -- Add delivery_restrictions (CRITICAL for Route Planning)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'delivery_restrictions') THEN
        ALTER TABLE profiles ADD COLUMN delivery_restrictions TEXT;
    END IF;

    -- Add payment_terms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'payment_terms') THEN
        ALTER TABLE profiles ADD COLUMN payment_terms TEXT;
    END IF;

    -- Add credit_limit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'credit_limit') THEN
        ALTER TABLE profiles ADD COLUMN credit_limit NUMERIC DEFAULT 0;
    END IF;

    -- Add segment
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'segment') THEN
        ALTER TABLE profiles ADD COLUMN segment TEXT;
    END IF;

    -- Add sales_rep_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'sales_rep_id') THEN
        ALTER TABLE profiles ADD COLUMN sales_rep_id UUID REFERENCES auth.users(id);
    END IF;
END $$;
