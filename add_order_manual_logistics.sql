-- Add manual delivery fields to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_manual_delivery BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_delivery_time TIME,
ADD COLUMN IF NOT EXISTS manual_delivery_margin INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS manual_delivery_note TEXT,
ADD COLUMN IF NOT EXISTS logistics_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.orders.is_manual_delivery IS 'Indica si el pedido tiene una configuración de entrega manual que sobrepasa la del perfil';
COMMENT ON COLUMN public.orders.manual_delivery_time IS 'Hora específica solicitada para la entrega';
COMMENT ON COLUMN public.orders.manual_delivery_margin IS 'Margen de flexibilidad en minutos (+/-)';
COMMENT ON COLUMN public.orders.manual_delivery_note IS 'Instrucciones específicas para la entrega manual';
COMMENT ON COLUMN public.orders.logistics_data IS 'Datos logísticos estructurados para optimización de rutas (JSONB)';
