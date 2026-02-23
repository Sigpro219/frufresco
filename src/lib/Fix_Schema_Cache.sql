-- SOLUCIÓN AL ERROR DE CACHÉ DE ESQUEMA
-- Ejecuta esto si Supabase dice que "no encuentra la columna" aunque ya la hayas creado

-- 1. Forzar recarga del esquema para que PostgREST vea las nuevas columnas
NOTIFY pgrst, 'reload schema';

-- 2. Por si acaso, verificar de nuevo que las columnas existan
-- Si este script falla aquí, es que las columnas realmente no se crearon
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE products ADD COLUMN variants jsonb DEFAULT '[]'::jsonb;
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'La columna variants ya existe.';
    END;
    
    BEGIN
        ALTER TABLE products ADD COLUMN options_config jsonb DEFAULT '[]'::jsonb;
    EXCEPTION WHEN duplicate_column THEN 
        RAISE NOTICE 'La columna options_config ya existe.';
    END;
END $$;
