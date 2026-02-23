-- ACTUALIZACIÓN PARA SOPORTE DE VARIACIONES
-- Ejecuta este script para permitir que las tareas de compra se separen por variante.

-- 1. Agregar variant_label a order_items
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS variant_label TEXT;

-- 2. Agregar variant_label a procurement_tasks
ALTER TABLE public.procurement_tasks 
ADD COLUMN IF NOT EXISTS variant_label TEXT;

-- 3. Agregar variant_label y voucher_image_url a purchases
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS variant_label TEXT,
ADD COLUMN IF NOT EXISTS voucher_image_url TEXT;

-- 4. Actualizar la política RLS y permisos
GRANT ALL ON public.order_items TO anon, authenticated;
GRANT ALL ON public.procurement_tasks TO anon, authenticated;
GRANT ALL ON public.purchases TO anon, authenticated;
