-- Migration: Add physical warehouse space assignment columns to orders table
-- Date: 2026-06-05

ALTER TABLE IF EXISTS orders 
ADD COLUMN IF NOT EXISTS crates_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS warehouse_spaces INTEGER[] DEFAULT '{}';

-- Add a comment for documentation
COMMENT ON COLUMN orders.crates_count IS 'Estimated or final count of crates (canastillas) required for the order';
COMMENT ON COLUMN orders.warehouse_spaces IS 'Physical warehouse spaces (1-150) assigned to the order for picking and staging';
