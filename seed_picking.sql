-- seed_picking.sql (FINAL V4)
-- 1. Eliminar restricción de usuario (temporal) para permitir Mock Clients
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Crear Zonas
CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL
);
INSERT INTO public.delivery_zones (name) VALUES 
('Norte'), ('Sur'), ('Oriente'), ('Occidente'), ('Centro')
ON CONFLICT DO NOTHING;

-- 3. Columna Zona en Profiles
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='delivery_zone_id') THEN 
        ALTER TABLE public.profiles ADD COLUMN delivery_zone_id uuid REFERENCES public.delivery_zones(id); 
    END IF; 
END $$;

-- 4. Clientes Mock (Rol b2b_client)
WITH zones AS (SELECT id, name FROM public.delivery_zones)
INSERT INTO public.profiles (id, company_name, role, delivery_zone_id)
SELECT 
    gen_random_uuid(),
    'Restaurante ' || s.i, 
    'b2b_client', 
    (SELECT id FROM zones ORDER BY random() LIMIT 1)
FROM generate_series(1, 40) AS s(i)
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE company_name = 'Restaurante ' || s.i);

-- 5. Productos (Tubérculos)
INSERT INTO public.products (sku, name, category, unit_of_measure, base_price, is_active) VALUES
('TUB-001', 'Papa Pastusa', 'Tubérculos', 'Kg', 3200, true),
('TUB-002', 'Papa Criolla', 'Tubérculos', 'Kg', 4500, true)
ON CONFLICT DO NOTHING;

-- 6. Pedidos (b2b_credit & shipping_address)
-- Aseguramos inserción limpia
INSERT INTO public.orders (customer_name, status, total, subtotal, type, shipping_address, delivery_date)
SELECT 
    p.company_name, 
    'approved', 
    10000, 
    10000, 
    'b2b_credit',
    'Dirección Calle Falsa 123', -- Dummy Address to satisfy NOT NULL
    CURRENT_DATE + 1
FROM public.profiles p
WHERE p.company_name LIKE 'Restaurante %'
AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_name = p.company_name);

-- 7. Items
INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
SELECT 
    o.id, 
    p.id, 
    floor(random() * 15 + 1)::int, 
    p.base_price
FROM public.orders o
CROSS JOIN (SELECT id, base_price FROM public.products WHERE category IN ('Hortalizas', 'Tubérculos') LIMIT 5) p
WHERE o.customer_name LIKE 'Restaurante %'
ON CONFLICT DO NOTHING;
