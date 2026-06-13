-- CREATE TABLE FOR CUSTOMER SERVICE PQRS
-- Relates to a profile (client) and optionally to a specific order.
CREATE TABLE IF NOT EXISTS customer_service_pqrs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('peticion', 'queja', 'reclamo', 'sugerencia', 'felicitacion')),
    category TEXT NOT NULL CHECK (category IN ('producto', 'entrega', 'facturacion', 'otro')),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    primary_photo_url TEXT,
    additional_photos TEXT[] DEFAULT '{}'::TEXT[],
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE customer_service_pqrs ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists and create all-access policy for authenticated users
DO $$
BEGIN
    DROP POLICY IF EXISTS "Enable all for authenticated on pqrs" ON customer_service_pqrs;
END $$;

CREATE POLICY "Enable all for authenticated on pqrs" ON customer_service_pqrs FOR ALL TO authenticated USING (true);
