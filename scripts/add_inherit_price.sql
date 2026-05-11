-- Add inherit_price column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS inherit_price BOOLEAN DEFAULT FALSE;

-- Update existing products to have inherit_price = false if they are parents
-- or true if they are children and have utility_deviation_pct set
UPDATE products SET inherit_price = FALSE WHERE parent_id IS NULL;
UPDATE products SET inherit_price = TRUE WHERE parent_id IS NOT NULL AND utility_deviation_pct != 0;
