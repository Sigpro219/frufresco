-- Eliminar políticas antiguas si existen para evitar conflictos
DROP POLICY IF EXISTS "Allow authenticated uploads to order-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read from order-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from order-attachments" ON storage.objects;

-- Permitir que usuarios autenticados carguen archivos en el bucket "order-attachments"
CREATE POLICY "Allow authenticated uploads to order-attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'order-attachments');

-- Permitir que usuarios autenticados lean los archivos del bucket "order-attachments"
CREATE POLICY "Allow authenticated read from order-attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'order-attachments');
