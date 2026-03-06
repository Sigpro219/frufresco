-- CONTENT SYNC FOR FRUFRESCO (TENANT #1)
-- Run this in the SQL Editor of your FruFresco Supabase project

INSERT INTO public.app_settings (key, value, description)
VALUES 
    -- 1. Hero Content
    ('hero_title', 'Excelencia en Frescura
para tu Negocio y Hogar', 'Título principal del Hero'),
    ('hero_description', 'Somos el aliado estratégico de los mejores restaurantes y casinos de Bogotá. Llevamos la calidad de Corabastos a tu puerta, con cero desperdicio y puntualidad suiza.', 'Descripción del Hero'),
    
    -- 2. Value Proposition (The missing section)
    ('value_proposition_items', '[
        { "icon": "⏱️", "title": "Entrega Puntual", "desc": "Tu operación no puede detenerse. Garantizamos entregas antes de la apertura de tu cocina." },
        { "icon": "🥬", "title": "Frescura Absoluta", "desc": "Seleccionamos producto a producto cada madrugada. Lo que recibes hoy, se cosechó ayer." },
        { "icon": "💎", "title": "Precios Competitivos", "desc": "Sin intermediarios innecesarios. Optimizamos la cadena para darte el mejor margen." }
    ]', 'Items de la sección de propuesta de valor (JSON)'),

    -- 3. Home Sections
    ('home_featured_title', '🔥 Lo más vendido de la semana', 'Título de la sección de destacados'),
    ('home_catalog_title', 'Nuestro Catálogo', 'Título de la sección del catálogo')

ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description;

-- Refresh cache
NOTIFY pgrst, 'reload schema';
