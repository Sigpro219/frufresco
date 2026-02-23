-- Permitir pedidos sin usuario de Auth (para clientes manuales/offline)
ALTER TABLE orders 
ALTER COLUMN user_id DROP NOT NULL;

-- Asegurar que existe la columna profile_id vinculada a profiles
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id);

-- Opcional: Crear índice para búsquedas rápidas por perfil
CREATE INDEX IF NOT EXISTS idx_orders_profile_id ON orders(profile_id);
