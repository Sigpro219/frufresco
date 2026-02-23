-- AGREGAR COORDENADAS A PERFILES (CLIENTES)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

COMMENT ON COLUMN public.profiles.latitude IS 'Latitud base de la empresa/cliente';
COMMENT ON COLUMN public.profiles.longitude IS 'Longitud base de la empresa/cliente';
