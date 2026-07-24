-- Migration: Add audit columns for route rectification and certification
-- Date: 2026-07-22

ALTER TABLE public.routes
ADD COLUMN IF NOT EXISTS check_evidence_url TEXT,
ADD COLUMN IF NOT EXISTS check_mode TEXT DEFAULT 'digital',
ADD COLUMN IF NOT EXISTS rectified_by_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS rectified_by_name TEXT,
ADD COLUMN IF NOT EXISTS rectified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_certified_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS certification_notes TEXT;

-- Index for querying rectified routes by timestamp and user
CREATE INDEX IF NOT EXISTS idx_routes_rectified_at ON public.routes(rectified_at);
CREATE INDEX IF NOT EXISTS idx_routes_rectified_by_id ON public.routes(rectified_by_id);
