
-- SEED DATA FOR BILLING MODULE

-- 1. Create a sample past cut
INSERT INTO billing_cuts (scheduled_date, cut_slot, status, total_orders, total_amount, created_at, closed_at)
VALUES 
(CURRENT_DATE - INTERVAL '1 day', 'AM', 'closed', 15, 1250000, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE - INTERVAL '1 day'),
(CURRENT_DATE - INTERVAL '1 day', 'PM', 'exported', 8, 850000, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE - INTERVAL '1 day');

-- 2. Create some sample returns (from drivers)
DO $$
DECLARE
    v_order_id UUID;
    v_product_id UUID;
BEGIN
    -- Get a random order 
    SELECT id INTO v_order_id FROM orders LIMIT 1;
    -- Get a random product
    SELECT id INTO v_product_id FROM products LIMIT 1;

    IF v_order_id IS NOT NULL AND v_product_id IS NOT NULL THEN
        INSERT INTO billing_returns (order_id, product_id, quantity_returned, reason, status, photo_url)
        VALUES 
        (v_order_id, v_product_id, 2.5, 'Caja dañada durante transporte', 'pending_review', 'https://via.placeholder.com/400x300?text=Remision+Firmada'),
        (v_order_id, v_product_id, 1, 'Producto no solicitado por cliente', 'pending_review', 'https://via.placeholder.com/400x300?text=Devolucion+Foto');
    END IF;
END $$;

-- 3. Ensure some orders are in 'delivered' status for new cuts
UPDATE orders 
SET status = 'delivered'
WHERE id IN (SELECT id FROM orders LIMIT 10);
