-- Migration: Add retry columns to mail table to support robust email queue processing
-- Columns: retry_count (default 0), next_retry_at (timestamp with time zone)

ALTER TABLE public.mail ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.mail ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone;

-- Optional: Create index on next_retry_at and status to speed up queue polling
CREATE INDEX IF NOT EXISTS idx_mail_retry_polling ON public.mail(status, next_retry_at) 
WHERE status = 'pending' OR status = 'retrying';
