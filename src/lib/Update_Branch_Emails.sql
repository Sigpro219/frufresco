-- Migration to add secondary billing emails and notification preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_2 TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_3 TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_email_1 BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_email_2 BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_email_3 BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.email_2 IS 'Secondary billing email for branches';
COMMENT ON COLUMN profiles.email_3 IS 'Tertiary billing email for branches';
COMMENT ON COLUMN profiles.notify_email_1 IS 'Flag to send invoice notification to primary email';
COMMENT ON COLUMN profiles.notify_email_2 IS 'Flag to send invoice notification to secondary email';
COMMENT ON COLUMN profiles.notify_email_3 IS 'Flag to send invoice notification to tertiary email';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
