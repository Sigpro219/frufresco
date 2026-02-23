-- AGREGAR PESO TOTAL A PEDIDOS
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_weight_kg DECIMAL(10,2) DEFAULT 0;

-- ACTUALIZAR COMENTARIO
COMMENT ON COLUMN public.orders.total_weight_kg IS 'Peso total del pedido en kg para planificación logística';

-- TRIGER O FUNCIÓN PARA CALCULAR PESO (OPCIONAL POR AHORA, PERO ÚTIL)
-- Asumimos que los productos tienen un campo weight_kg.
-- Pero por ahora, el usuario puede querer cargarlo manualmente o vía API.
