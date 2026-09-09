-- Migración para soporte de evidencias y decisiones en inventory_movements
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS admin_decision TEXT;
