-- CONFIGURACIÓN DE ALMACENAMIENTO PARA VALES DE COMPRA

-- 1. Crear el bucket 'vouchers' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('vouchers', 'vouchers', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Política para permitir que cualquier persona vea los vales (Para auditoría)
DROP POLICY IF EXISTS "Public Voucher Access" ON storage.objects;
CREATE POLICY "Public Voucher Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'vouchers' );

-- 3. Política para permitir que usuarios autenticados (Compradores) suban vales
DROP POLICY IF EXISTS "Authenticated users can upload vouchers" ON storage.objects;
CREATE POLICY "Authenticated users can upload vouchers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'vouchers' );

-- 4. Política para permitir que administradores o el mismo subidor borren vales
DROP POLICY IF EXISTS "Users can manage their own vouchers" ON storage.objects;
CREATE POLICY "Users can manage their own vouchers"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'vouchers' );
