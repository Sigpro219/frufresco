-- Modificaciones a la tabla ORDERS para soportar Módulo 3.7
-- 1. Agregar columna de Origen
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS origin_source VARCHAR(50) DEFAULT 'web_b2c'; 
-- Valores esperados: 'web_b2c', 'web_b2b', 'whatsapp', 'phone', 'email', 'file_upload'

-- 2. Agregar fecha de entrega programada (Vital para compras)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_date DATE DEFAULT CURRENT_DATE + 1; -- Por defecto mañana

-- 3. Agregar notas administrativas (internas) vs notas del cliente
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- 4. Asegurar estado 'draft' y otros en el check (si existe constraint)
-- Primero eliminamos constraint viejo si choca, o lo actualizamos. 
-- Nota: En Supabase a veces es mejor dejar texto libre o validar en App, 
-- pero para integridad vamos a intentar ampliar el check si es necesario.
-- (Asumimos que la columna status es texto simple por ahora para evitar bloqueos, 
--  pero documentamos los estados: 'draft', 'pending_approval', 'approved', 'processing', 'dispatched', 'delivered', 'cancelled')

-- 5. Columna para almacenar el archivo de evidencia (PDF/Imagen) si aplica
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS evidence_url TEXT;

-- 6. Columna para la Ruta Asignada (Calculada o Manual)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS assigned_route_id VARCHAR(50);
