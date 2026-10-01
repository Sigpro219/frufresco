-- ==============================================================================
-- Migración: Incorporar parámetro max_order_hogar_cod en public.app_settings
-- FruFresco - Control de Riesgo Financiero y Recaudo (SDD v1.9.60)
-- ==============================================================================

INSERT INTO public.app_settings (key, value, description)
VALUES (
    'max_order_hogar_cod',
    '400000',
    'Tope máximo monetario permitido para pedidos del segmento Hogar (B2C) bajo modalidad Contra Entrega'
)
ON CONFLICT (key) DO UPDATE
SET 
    value = '400000',
    description = EXCLUDED.description;

-- Verificación de inserción
SELECT * FROM public.app_settings WHERE key = 'max_order_hogar_cod';
