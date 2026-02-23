-- Update existing B2B clients to have Bogotá as default location
-- This ensures the city appears in the client cards

UPDATE profiles
SET 
    city = 'Bogotá',
    municipality = 'Bogotá',
    department = 'Cundinamarca'
WHERE role = 'b2b_client' 
  AND (city IS NULL OR city = '' OR municipality IS NULL);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
