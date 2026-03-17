-- HELP DESK: support_tickets TABLE
-- Run this in the Supabase SQL Editor of your project.
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who submitted
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    
    -- Ticket content
    subject TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',    -- general | technical | billing | geocerca | permissions
    priority TEXT DEFAULT 'normal',     -- low | normal | high | urgent
    
    -- Status lifecycle
    status TEXT DEFAULT 'open',         -- open | in_progress | waiting | resolved | closed
    
    -- Timestamps for response time measurement
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    first_response_at TIMESTAMP WITH TIME ZONE,  -- When chief engineer first replied
    resolved_at TIMESTAMP WITH TIME ZONE,        -- When ticket was closed/resolved
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    
    -- Admin response
    response TEXT,
    responded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can create their own tickets and read them
DROP POLICY IF EXISTS "Users can manage own tickets" ON public.support_tickets;
CREATE POLICY "Users can manage own tickets" ON public.support_tickets
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Admins can see and manage ALL tickets
DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.support_tickets;
CREATE POLICY "Admins can manage all tickets" ON public.support_tickets
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'web_admin', 'sys_admin')
        )
    );

-- Computed: Response time in minutes (materialized as a helper view)
CREATE OR REPLACE VIEW public.support_tickets_metrics AS
SELECT
    id,
    subject,
    category,
    priority,
    status,
    created_at,
    first_response_at,
    resolved_at,
    -- Time to first response in minutes
    CASE 
        WHEN first_response_at IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60)
        ELSE NULL
    END AS response_time_minutes,
    -- Time to resolution in minutes
    CASE 
        WHEN resolved_at IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)
        ELSE NULL
    END AS resolution_time_minutes
FROM public.support_tickets;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON public.support_tickets(created_at DESC);

GRANT ALL ON public.support_tickets TO anon, authenticated;
GRANT ALL ON public.support_tickets_metrics TO anon, authenticated;

-- ----------------------------------------------------------------
-- SAMPLE DATA (optional - uncomment to seed test data)
-- ----------------------------------------------------------------
/*
INSERT INTO public.support_tickets (subject, description, category, priority, status, user_email, user_name, first_response_at, resolved_at)
VALUES 
    ('No puedo acceder al módulo de inventarios', 'Aparece error 403 al intentar entrar.', 'permissions', 'high', 'in_progress', 'colaborador@empresa.com', 'Juan P.', now() - INTERVAL '2 hours', NULL),
    ('Actualización de geocerca sede norte', 'Solicito ampliar el radio 200m hacia el occidente.', 'geocerca', 'normal', 'open', 'logistica@empresa.com', 'Logística Central', NULL, NULL),
    ('Error en factura #FAC-2024-089', 'El IVA aparece mal calculado en la factura.', 'billing', 'urgent', 'resolved', 'contabilidad@empresa.com', 'Lucía M.', now() - INTERVAL '1 day', now() - INTERVAL '23 hours');
*/
