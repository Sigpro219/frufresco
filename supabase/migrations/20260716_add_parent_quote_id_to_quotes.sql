-- Migration: Add parent_quote_id to quotes table for version lineage
-- Path: supabase/migrations/20260716_add_parent_quote_id_to_quotes.sql

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS parent_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
COMMENT ON COLUMN quotes.parent_quote_id IS 'ID de la cotización de la cual es versión o duplicación';
