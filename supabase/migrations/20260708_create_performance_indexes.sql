-- Migration: Create database performance indexes to optimize query speed and eliminate sequential scans
-- Target columns: orders(profile_id, delivery_date), order_items(order_id, product_id), inventory_movements(product_id)

-- 1. Table: orders
CREATE INDEX IF NOT EXISTS idx_orders_profile_id ON public.orders(profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON public.orders(delivery_date);

-- 2. Table: order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- 3. Table: inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON public.inventory_movements(product_id);
