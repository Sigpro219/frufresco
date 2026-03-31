-- 1. Mejorar tabla de productos con campos comerciales
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS web_unit TEXT DEFAULT 'Kg',
ADD COLUMN IF NOT EXISTS web_conversion_factor NUMERIC DEFAULT 1.0;

-- Sincronizar display_name inicial con el nombre técnico para evitar vacíos
UPDATE public.products 
SET display_name = name 
WHERE display_name IS NULL;

-- 2. Registrar la unidad comercial en los items de pedido
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS unit TEXT;

-- 3. Crear tabla para "Máscaras" o Nicknames por cliente
CREATE TABLE IF NOT EXISTS public.product_nicknames (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    custom_name TEXT NOT NULL,
    custom_sku TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, product_id)
);

-- 3. Habilitar RLS para la nueva tabla
ALTER TABLE public.product_nicknames ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
CREATE POLICY "Permitir lectura a usuarios dueños del perfil" 
ON public.product_nicknames 
FOR SELECT 
USING (auth.uid() = profile_id);

CREATE POLICY "Permitir gestión total a administradores" 
ON public.product_nicknames 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'ops', 'commercial')
    )
);

-- Forzar recarga de PostgREST
NOTIFY pgrst, 'reload schema';
