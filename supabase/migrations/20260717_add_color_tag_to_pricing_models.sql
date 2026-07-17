-- Migration: Add color_tag column to pricing_models with strict unique constraint
-- Path: supabase/migrations/20260717_add_color_tag_to_pricing_models.sql

-- 1. Agregar columna de clasificación por semáforo si no existe
ALTER TABLE pricing_models ADD COLUMN IF NOT EXISTS color_tag TEXT;

-- 2. Establecer valores iniciales por defecto basados en nombres
UPDATE pricing_models SET color_tag = 'verde' WHERE name ILIKE '%grande%' AND color_tag IS NULL;
UPDATE pricing_models SET color_tag = 'amarillo' WHERE name ILIKE '%mediano%' AND color_tag IS NULL;
UPDATE pricing_models SET color_tag = 'rojo' WHERE name ILIKE '%pequeño%' AND color_tag IS NULL;

-- 3. Limpiar duplicados potenciales para evitar errores al crear la restricción única
WITH duplicates AS (
  SELECT id, color_tag,
         ROW_NUMBER() OVER (PARTITION BY color_tag ORDER BY id DESC) as rn
  FROM pricing_models
  WHERE color_tag IS NOT NULL
)
UPDATE pricing_models
SET color_tag = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 4. Crear restricción de valor único (permite múltiples NULLs en PostgreSQL)
ALTER TABLE pricing_models DROP CONSTRAINT IF EXISTS pricing_models_color_tag_unique;
ALTER TABLE pricing_models ADD CONSTRAINT pricing_models_color_tag_unique UNIQUE (color_tag);

COMMENT ON COLUMN pricing_models.color_tag IS 'Semaforo color classification: verde, amarillo, rojo or null. Strict unique constraint: only one model per color.';
