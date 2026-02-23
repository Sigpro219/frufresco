-- Solución: Actualizar el rol a 'admin'
UPDATE profiles 
SET role = 'admin' 
WHERE id = 'b80dd828-e83d-4ad8-b3ad-5ddc11613cd9';

-- Verificar que se aplicó
SELECT id, role, company_name 
FROM profiles 
WHERE id = 'b80dd828-e83d-4ad8-b3ad-5ddc11613cd9';
