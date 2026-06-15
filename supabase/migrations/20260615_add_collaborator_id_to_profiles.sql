-- 1. Add collaborator_id column to profiles referencing collaborators(id)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS collaborator_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL;

-- 2. Create index for faster joins/lookups
CREATE INDEX IF NOT EXISTS idx_profiles_collaborator_id ON public.profiles(collaborator_id);

-- 3. Update sync trigger function to use collaborator_id instead of role_id
CREATE OR REPLACE FUNCTION public.sync_collaborator_active_status()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET is_active = NEW.is_active
    WHERE collaborator_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
