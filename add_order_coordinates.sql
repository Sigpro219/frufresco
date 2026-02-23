-- AGREGAR COORDENADAS A PEDIDOS
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

COMMENT ON COLUMN public.orders.latitude IS 'Latitud de la dirección de entrega';
COMMENT ON COLUMN public.orders.longitude IS 'Longitud de la dirección de entrega';
