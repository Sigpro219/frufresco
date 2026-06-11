-- Migration: Add autosync_days column to pricing_models
-- Path: supabase/migrations/20260611_add_autosync_days.sql

ALTER TABLE pricing_models ADD COLUMN IF NOT EXISTS autosync_days INT[] DEFAULT ARRAY[0,1,2,3,4,5,6];
