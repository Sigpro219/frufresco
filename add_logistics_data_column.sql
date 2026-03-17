-- Add logistics_data column to profiles for structured time windows
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logistics_data JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN profiles.logistics_data IS 'Structured delivery windows and logistics constraints parsed by AI. Format: { "windows": [{ "startTime": "HH:MM", "endTime": "HH:MM" }], "days": [1,2,3...], "notes": "string" }';
