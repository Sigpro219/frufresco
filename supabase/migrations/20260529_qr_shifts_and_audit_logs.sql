-- Add QR token and allowed modules array columns to collaborators table
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT '{}'::text[];

-- Create active index for faster QR lookups
CREATE INDEX IF NOT EXISTS idx_collaborators_qr_token ON collaborators(qr_token);

-- Create collaborator_shifts table for managing daily operational access
CREATE TABLE IF NOT EXISTS collaborator_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaborator_id UUID NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    device_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index to track active collaborator shifts
CREATE INDEX IF NOT EXISTS idx_shifts_active_collab ON collaborator_shifts(collaborator_id) WHERE (status = 'active');

-- Create a robust audit_logs table for user and database audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    collaborator_id UUID REFERENCES collaborators(id) ON DELETE SET NULL,
    collaborator_name TEXT,
    action VARCHAR(100) NOT NULL,
    module VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Create an automatic partition cleaning helper function (cleans data older than 60 days)
CREATE OR REPLACE FUNCTION clean_old_audit_logs()
RETURNS trigger AS $$
BEGIN
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '60 days';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute cleaning routine on new log insert
CREATE OR REPLACE TRIGGER trg_clean_old_audit_logs
    AFTER INSERT ON audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION clean_old_audit_logs();
