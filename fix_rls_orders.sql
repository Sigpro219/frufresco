-- Habilitar acceso total de lectura a la tabla orders para usuarios autenticados (Staff/Admin)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 1. Eliminar política restrictiva anterior si existe (ej: "Users can only view their own orders")
-- Nota: Dejamos esto comentado para no romper acceso de clientes, mejor AGREGAMOS una nueva permisiva para Staff.

-- 2. Crear política para que Staff/Admin vean TODO
-- Asumimos que cualquier usuario autenticado en el backoffice es Staff por ahora.
CREATE POLICY "Staff can view all orders"
ON orders FOR SELECT
TO authenticated
USING (true);

-- 3. Asegurar también que se puedan insertar/actualizar pedidos donde user_id sea null
CREATE POLICY "Staff can insert manual orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Staff can update any order"
ON orders FOR UPDATE
TO authenticated
USING (true);
