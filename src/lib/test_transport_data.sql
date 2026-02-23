-- DATA DE PRUEBA PARA TRANSPORTE (LOGÍSTICA)

-- 1. Crear una Ruta de prueba (Asignada al primer usuario que encuentre)
INSERT INTO public.routes (vehicle_plate, status, total_orders, total_kilos)
VALUES ('ABC-123', 'in_transit', 2, 150.5);

-- 2. Vincular órdenes reales a esta ruta (Tomamos 2 órdenes existentes)
INSERT INTO public.route_stops (route_id, order_id, sequence_number, status)
SELECT 
    (SELECT id FROM public.routes WHERE vehicle_plate = 'ABC-123' LIMIT 1),
    id,
    row_number() OVER (),
    'pending'
FROM public.orders
LIMIT 2;

-- 3. Crear una novedad de prueba (Delivery Event)
INSERT INTO public.delivery_events (order_id, event_type, description)
SELECT id, 'rejection', 'Cliente no estaba en casa'
FROM public.orders
LIMIT 1;

-- 4. Actualizar estadísticas de canastillas
INSERT INTO public.asset_ledger (client_name, balance)
VALUES ('Restaurante de Prueba', 15);
