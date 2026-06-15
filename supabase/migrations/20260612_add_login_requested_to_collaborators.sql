-- 1. Add login_requested column to collaborators table
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS login_requested BOOLEAN DEFAULT FALSE;

-- 2. Create trigger function to sync collaborator active status to profiles table
CREATE OR REPLACE FUNCTION public.sync_collaborator_active_status()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET is_active = NEW.is_active
    WHERE role_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger to collaborators table
DROP TRIGGER IF EXISTS tr_sync_collaborator_active_status ON public.collaborators;
CREATE TRIGGER tr_sync_collaborator_active_status
AFTER UPDATE OF is_active ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.sync_collaborator_active_status();
