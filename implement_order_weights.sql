-- AGREGAR COLUMNAS DE PESO (DIFERIDAS)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(10,3);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_weight_kg DECIMAL(10,2) DEFAULT 0;
COMMENT ON COLUMN public.orders.total_weight_kg IS 'Peso total del pedido en kg para planificación logística';

-- REPARAR PESOS DE PRODUCTOS SEGÚN SU UNIDAD
-- Si la unidad es Kg, el peso por unidad debe ser 1.0kg (no el 0.5 default)
UPDATE public.products 
SET weight_kg = 1.0 
WHERE (unit_of_measure ILIKE 'kg' OR unit_of_measure ILIKE 'kilo%') 
AND (weight_kg IS NULL OR weight_kg = 0.5);

-- Para libras, usamos 0.5kg como aproximación estándar comercial
UPDATE public.products 
SET weight_kg = 0.5 
WHERE (unit_of_measure ILIKE 'lb' OR unit_of_measure ILIKE 'libra%') 
AND (weight_kg IS NULL OR weight_kg = 0.5);

-- Fallback para nuevos productos
UPDATE public.products SET weight_kg = 1.0 WHERE weight_kg IS NULL AND unit_of_measure ILIKE 'kg';
UPDATE public.products SET weight_kg = 0.1 WHERE weight_kg IS NULL;

-- ACTUALIZAR PESO TOTAL EN PEDIDOS BASADO EN ITEMS
CREATE OR REPLACE FUNCTION public.calculate_order_weight(p_order_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_total_weight DECIMAL;
BEGIN
    SELECT COALESCE(SUM(oi.quantity * p.weight_kg), 0)
    INTO v_total_weight
    FROM public.order_items oi
    JOIN public.products p ON oi.product_id = p.id
    WHERE oi.order_id = p_order_id;

    UPDATE public.orders
    SET total_weight_kg = v_total_weight
    WHERE id = p_order_id;

    RETURN v_total_weight;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER PARA ACTUALIZAR AUTOMÁTICAMENTE EL PESO DEL PEDIDO
CREATE OR REPLACE FUNCTION public.tr_update_order_weight()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM public.calculate_order_weight(OLD.order_id);
    ELSE
        PERFORM public.calculate_order_weight(NEW.order_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_order_items_weight ON public.order_items;
CREATE TRIGGER tr_order_items_weight
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tr_update_order_weight();

-- ACTUALIZAR DATOS EXISTENTES
UPDATE public.orders o
SET total_weight_kg = (
    SELECT COALESCE(SUM(oi.quantity * p.weight_kg), 0)
    FROM public.order_items oi
    JOIN public.products p ON oi.product_id = p.id
    WHERE oi.order_id = o.id
);
