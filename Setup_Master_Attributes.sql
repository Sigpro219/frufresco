-- 1. Create the product_attributes_master table
CREATE TABLE IF NOT EXISTS public.product_attributes_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    suggested_values TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Populate with INITIAL_ATTRIBUTES
INSERT INTO public.product_attributes_master (name, suggested_values)
VALUES 
    ('Madurez', ARRAY['Verde', 'Pintón', 'Maduro', 'Sobremaduro']),
    ('Tamaño', ARRAY['Pequeño', 'Mediano', 'Grande', 'Extra Grande']),
    ('Calidad', ARRAY['Primera (Extra)', 'Segunda (Estándar)', 'Industrial']),
    ('Presentación', ARRAY['Granel', 'Empacado', 'Malla', 'Caja']),
    ('Corte', ARRAY['Entero', 'Picado', 'Troceado', 'Pelado']),
    ('Proceso', ARRAY['Lavado', 'Sucio', 'Cepillado'])
ON CONFLICT (name) DO UPDATE SET 
    suggested_values = EXCLUDED.suggested_values,
    updated_at = NOW();

-- 3. RLS Policies (Security)
ALTER TABLE public.product_attributes_master ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (Public Browse)
CREATE POLICY "Allow public read access" ON public.product_attributes_master 
    FOR SELECT USING (true);

-- Allow authenticated users to manage (Admin/Ops)
CREATE POLICY "Allow authenticated full access" ON public.product_attributes_master 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Refresh postgrest cache
NOTIFY pgrst, 'reload schema';
