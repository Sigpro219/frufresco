-- Migration to add contact_email to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email TEXT;
COMMENT ON COLUMN profiles.contact_email IS 'Direct operational contact email, independent from billing inheritance';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
