-- Verificar el rol del usuario administrador
SELECT 
    id, 
    role, 
    company_name, 
    contact_name,
    CASE 
        WHEN role = 'admin' THEN '✅ Correcto - Debería ver dropdown'
        WHEN role = 'employee' THEN '✅ Correcto - Debería ver dropdown'
        WHEN role = 'b2b_client' THEN '❌ Incorrecto - Es cliente B2B, no empleado'
        ELSE '⚠️ Rol desconocido: "' || role || '"'
    END as verificacion
FROM profiles 
WHERE id = 'b80dd828-e83d-4ad8-b3ad-5ddc11613cd9';

-- Si el rol NO es 'admin' o 'employee', ejecuta esto para corregirlo:
-- UPDATE profiles SET role = 'admin' WHERE id = 'b80dd828-e83d-4ad8-b3ad-5ddc11613cd9';
