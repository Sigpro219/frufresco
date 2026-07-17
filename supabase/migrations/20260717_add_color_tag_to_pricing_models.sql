-- Migration: Add color_tag column to pricing_models for B2B classification
-- Path: supabase/migrations/20260717_add_color_tag_to_pricing_models.sql

ALTER TABLE pricing_models ADD COLUMN IF NOT EXISTS color_tag TEXT;
COMMENT ON COLUMN pricing_models.color_tag IS 'Semaforo color classification: verde, amarillo, rojo or null';

-- Set default initial tags based on name matching
UPDATE pricing_models SET color_tag = 'verde' WHERE name ILIKE '%grande%';
UPDATE pricing_models SET color_tag = 'amarillo' WHERE name ILIKE '%mediano%';
UPDATE pricing_models SET color_tag = 'rojo' WHERE name ILIKE '%pequeño%';
