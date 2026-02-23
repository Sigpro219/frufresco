-- Permitir que usuarios autenticados (Staff) vean TODOS los perfiles
-- Esto soluciona que la búsqueda de clientes B2B salga vacía
DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;

CREATE POLICY "Staff can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Política de respaldo por si existían otras restrictivas
-- Asegúrate de que no haya conflicto, las políticas permisivas (USING true) suelen ganar en 'OR' logic.
