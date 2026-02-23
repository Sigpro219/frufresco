-- 1. Add picked_quantity column
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS picked_quantity numeric DEFAULT 0;

-- 2. Update existing items to have 0 or random picked (for testing)
UPDATE public.order_items SET picked_quantity = 0 WHERE picked_quantity IS NULL;
