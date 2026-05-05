-- Add new fields for institutional clients (Matriz and Sucursal)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS additional_billing_emails TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rut_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mercantile_registry_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iva_responsible BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_gran_contribuyente BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_autorretenedor BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS economic_activity_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS collection_responsible_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS collection_responsible_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS collection_responsible_phone TEXT;

-- Update RLS policies to allow reading/writing these new columns (already covered if policies use * or specific columns)
-- Usually policies on profiles are restrictive, let's ensure authenticated users can manage their own data 
-- and admins can manage everything. 
-- Since existing policies likely exist, we don't necessarily need new ones unless they were column-specific.
