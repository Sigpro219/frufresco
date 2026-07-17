-- Add commercial_references_urls column to profiles table for storing multiple commercial reference docs
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS commercial_references_urls text[] DEFAULT '{}';
COMMENT ON COLUMN public.profiles.commercial_references_urls IS 'Arreglo de URLs para documentos de referencias comerciales del cliente B2B';
