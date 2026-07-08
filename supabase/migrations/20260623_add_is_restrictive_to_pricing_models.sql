-- Migration: Add is_restrictive column to pricing_models
ALTER TABLE pricing_models ADD COLUMN IF NOT EXISTS is_restrictive BOOLEAN DEFAULT FALSE;
