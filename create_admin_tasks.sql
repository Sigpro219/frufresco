-- Create admin_tasks table for the Kanban board
CREATE TABLE IF NOT EXISTS admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
    target_role TEXT,
    target_status TEXT DEFAULT 'Activo',
    assigned_to UUID REFERENCES profiles(id),
    attachments TEXT[] DEFAULT '{}',
    scheduled_start TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;

-- Policies for admin/authenticated users
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON admin_tasks;
CREATE POLICY "Enable read access for authenticated users" 
ON admin_tasks FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON admin_tasks;
CREATE POLICY "Enable insert for authenticated users" 
ON admin_tasks FOR INSERT 
TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for authenticated users" ON admin_tasks;
CREATE POLICY "Enable update for authenticated users" 
ON admin_tasks FOR UPDATE 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON admin_tasks;
CREATE POLICY "Enable delete for authenticated users" 
ON admin_tasks FOR DELETE 
TO authenticated 
USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_admin_tasks_updated_at
    BEFORE UPDATE ON admin_tasks
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
