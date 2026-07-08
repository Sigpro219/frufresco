-- Extension of product exceptions mapping table to support substitutions, delivery notes, and preferred variant options
ALTER TABLE public.product_nicknames
ADD COLUMN IF NOT EXISTS substitution_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delivery_note TEXT,
ADD COLUMN IF NOT EXISTS preferred_options JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.product_nicknames.substitution_product_id IS 'Producto que debe reemplazar automáticamente al original si este cliente lo solicita';
COMMENT ON COLUMN public.product_nicknames.delivery_note IS 'Instrucciones para el conductor al momento del despacho/entrega';
COMMENT ON COLUMN public.product_nicknames.preferred_options IS 'Objeto JSON con los valores por defecto de variantes (ej: {"Maduración": "Maduro", "Tamaño": "Grande"})';

NOTIFY pgrst, 'reload schema';
