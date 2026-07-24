-- Migration: Allow all staff and commercial roles full access to profiles/clients
-- Target Table: profiles

CREATE OR REPLACE FUNCTION public.is_staff(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
    IF user_role IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN user_role NOT IN ('b2b_client', 'b2c_client');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old profile policies
DROP POLICY IF EXISTS "Allow staff to select all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow staff to manage profiles" ON public.profiles;

-- Create comprehensive policies for all staff and commercial roles
CREATE POLICY "Allow staff to select all profiles" 
ON public.profiles FOR SELECT 
TO authenticated, anon
USING (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
  auth.uid() = id
);

CREATE POLICY "Allow staff to manage profiles" 
ON public.profiles FOR ALL 
TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
  auth.uid() = id
)
WITH CHECK (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
  auth.uid() = id
);
