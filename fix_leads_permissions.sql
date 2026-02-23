-- FIX: Permisos para la tabla LEADS
-- Este script permite que los administradores puedan gestionar leads (incluyendo borrar)
-- y que el público pueda insertar prospectos desde el Bot.

-- 1. Habilitar RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas para evitar conflictos
DROP POLICY IF EXISTS "Public and Anon Insert Leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users view leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users update leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can manage leads" ON public.leads;

-- 3. Crear políticas definitivas

-- 3.1 CUALQUIERA (incluyendo el Bot sin login) puede insertar prospectos
CREATE POLICY "Bot can insert leads" 
ON public.leads FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- 3.2 Solo USUARIOS AUTENTICADOS (Admins/Empleados) pueden ver y editar leads
CREATE POLICY "Admins can manage leads" 
ON public.leads FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Borrar el lead específico "La catira" (opcional, pero solicitado)
DELETE FROM public.leads 
WHERE company_name ILIKE '%La catira%' 
   OR contact_name ILIKE '%Andres López%'
   OR phone ILIKE '%310444558%';
