-- 1. Tabla de Cola de Correos Salientes (Trigger Email)
CREATE TABLE IF NOT EXISTS public.mail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message JSONB, -- Contiene { text, html } para envío directo
    template JSONB, -- Contiene { name, data } para plantillas
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ
);

-- 2. Tabla para Borradores de Pedidos Recibidos por Email (Inbound)
CREATE TABLE IF NOT EXISTS public.order_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    client_detected_name TEXT,
    source_email TEXT NOT NULL,
    email_subject TEXT,
    email_body TEXT,
    extracted_items JSONB, -- Array de { originalName, quantity, suggestedProductId }
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.mail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_drafts ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para la aplicación (idempotentes)
DROP POLICY IF EXISTS "Allow authenticated read/write mail" ON public.mail;
CREATE POLICY "Allow authenticated read/write mail" ON public.mail FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read/write drafts" ON public.order_drafts;
CREATE POLICY "Allow authenticated read/write drafts" ON public.order_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);
