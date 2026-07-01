ALTER TABLE pricing_models ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE pricing_models ADD COLUMN IF NOT EXISTS end_date DATE;
