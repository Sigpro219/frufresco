-- LOGÍSTICA DE COMPRA: UNIDAD Y TIEMPO DE RECOGIDA
-- Ejecuta este script para permitir capturar la unidad de compra (empaque) y la hora de recogida.

ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS purchase_unit TEXT, -- Ej: Bulto, Caja, Canastilla
ADD COLUMN IF NOT EXISTS estimated_pickup_time TIMESTAMPTZ; -- Hora exacta estimada
