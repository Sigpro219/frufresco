-- ============================================================================
-- MIGRACIÓN CANÓNICA SDD v1.9.205: CUARTETO DE ACUERDOS ESPECIALES & PADRÓN DE CLIENTES POR MODELO
-- Patrón: Zero-Downtime Expand & Contract (100% Idempotente)
-- Propósito:
--   1. Crear estructura SQL para los 4 Modelos de Acuerdos Especiales:
--      ('nutresa', 'colsubsidio', 'general_quincenal', 'general_mensual')
--   2. Crear tabla relacional `special_agreement_model_clients` (Lista de Clientes Aplicables a cada Modelo)
--   3. Garantizar existencia de los Acuerdos Maestros en `quotes` (388 SKUs para Quincenal y Mensual)
--   4. Pre-poblar automáticamente las cohortes reales de clientes Quincenales (27), Mensuales (8), Nutresa y Colsubsidio
--   5. Crear RPC `apply_special_agreement_to_clients` para propagación selectiva en cascada
-- ============================================================================

BEGIN;

-- 1. TABLA MAESTRA DE MODELOS DE ACUERDOS ESPECIALES
CREATE TABLE IF NOT EXISTS public.special_agreement_models (
    id text PRIMARY KEY, -- 'nutresa' | 'colsubsidio' | 'general_quincenal' | 'general_mensual'
    name text NOT NULL,
    subtitle text,
    cycle_type text NOT NULL, -- 'sipsa_prima' | 'quincenal_corporativo' | 'quincenal_general' | 'mensual_general'
    default_duration_days integer NOT NULL DEFAULT 15,
    master_quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
    start_date date,
    valid_until date,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. TABLA RELACIONAL: LISTA DE CLIENTES APLICABLES AL MODELO (PADRÓN SUSCRITO)
CREATE TABLE IF NOT EXISTS public.special_agreement_model_clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id text NOT NULL REFERENCES public.special_agreement_models(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_default_selected boolean NOT NULL DEFAULT true,
    last_applied_at timestamptz,
    last_applied_quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (model_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_samc_model_id ON public.special_agreement_model_clients(model_id);
CREATE INDEX IF NOT EXISTS idx_samc_client_id ON public.special_agreement_model_clients(client_id);

-- Habilitar RLS con políticas permisivas para operación interna y service_role
ALTER TABLE public.special_agreement_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_agreement_model_clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'special_agreement_models' AND policyname = 'allow_all_special_agreement_models'
    ) THEN
        CREATE POLICY allow_all_special_agreement_models ON public.special_agreement_models FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'special_agreement_model_clients' AND policyname = 'allow_all_special_agreement_model_clients'
    ) THEN
        CREATE POLICY allow_all_special_agreement_model_clients ON public.special_agreement_model_clients FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3. ASEGURAR ACUERDO MAESTRO "QUINCENAL GENERAL" EN `quotes` (SI NO EXISTE) Y CLONAR SUS 388 ÍTEMS BASE
DO $$
DECLARE
    v_quincenal_quote_id uuid;
    v_mensual_quote_id uuid := '6572e7d6-4925-4576-8960-caca64a3c47f';
    v_template_source_id uuid;
BEGIN
    -- Buscar si ya existe un acuerdo maestro Quincenal General sin cliente específico
    SELECT id INTO v_quincenal_quote_id
    FROM public.quotes
    WHERE status = 'agreement'
      AND client_id IS NULL
      AND (client_name ILIKE '%QUINCENAL GENERAL%' OR model_snapshot_name ILIKE '%QUINCENAL GENERAL%')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Si no existe, crearlo tomando como base los 388 productos de la lista general (#165 o #122)
    IF v_quincenal_quote_id IS NULL THEN
        SELECT id INTO v_template_source_id
        FROM public.quotes
        WHERE id IN ('6572e7d6-4925-4576-8960-caca64a3c47f', 'cb061c03-c9c8-4088-8373-464eb20396bd')
        LIMIT 1;

        INSERT INTO public.quotes (
            client_id,
            client_name,
            model_id,
            model_snapshot_name,
            subtotal_amount,
            total_tax_amount,
            total_amount,
            status,
            start_date,
            valid_until
        )
        VALUES (
            NULL,
            'QUINCENAL GENERAL - OCTUBRE 2026',
            'd90a91e5-827c-473d-9d4f-3e28c7c91e15',
            'QUINCENAL GENERAL - OCTUBRE 2026',
            0,
            0,
            0,
            'agreement',
            '2026-10-16',
            '2026-10-31'
        )
        RETURNING id INTO v_quincenal_quote_id;

        IF v_template_source_id IS NOT NULL THEN
            INSERT INTO public.quote_items (
                quote_id,
                product_id,
                product_name,
                quantity,
                cost_basis,
                margin_percent,
                unit_price,
                iva_rate,
                iva_amount,
                total_price
            )
            SELECT
                v_quincenal_quote_id,
                product_id,
                product_name,
                quantity,
                cost_basis,
                margin_percent,
                unit_price,
                iva_rate,
                iva_amount,
                total_price
            FROM public.quote_items
            WHERE quote_id = v_template_source_id;
        END IF;
    END IF;

    -- 4. INSERTAR / ACTUALIZAR LOS 4 MODELOS ESPECIALES CANÓNICOS
    INSERT INTO public.special_agreement_models (id, name, subtitle, cycle_type, default_duration_days, master_quote_id, start_date, valid_until)
    VALUES
        ('nutresa', 'Grupo Nutresa (IRCC)', 'El Corral • Beer Station • Leños & Carbón', 'sipsa_prima', 30, 'ab9c0c14-a27e-4317-9995-dfb4ba9bcb80', '2026-10-05', '2026-10-31'),
        ('colsubsidio', 'Colsubsidio', 'Restaurantes • Hoteles (Piscilago) • Sedes Recreativas', 'quincenal_corporativo', 15, '5afc3173-4ced-4635-a71f-56ef57e144f8', '2026-10-16', '2026-10-31'),
        ('general_quincenal', 'Lista General Quincenal', 'Hoteles, Clubes y Cadenas con fijación cada 15 días', 'quincenal_general', 15, v_quincenal_quote_id, '2026-10-16', '2026-10-31'),
        ('general_mensual', 'Lista General Mensual', 'Colegios, Universidades y Empresas con fijación a 30 días', 'mensual_general', 30, v_mensual_quote_id, '2026-10-01', '2026-10-31')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        subtitle = EXCLUDED.subtitle,
        cycle_type = EXCLUDED.cycle_type,
        default_duration_days = EXCLUDED.default_duration_days,
        master_quote_id = COALESCE(public.special_agreement_models.master_quote_id, EXCLUDED.master_quote_id),
        updated_at = now();
END $$;

-- 5. POBLADO AUTOMÁTICO DEL PADRÓN DE CLIENTES APLICABLES A CADA MODELO
-- 5.1 Clientes de NUTRESA (Casa Matriz IRCC + todas sus sucursales hijas)
INSERT INTO public.special_agreement_model_clients (model_id, client_id, is_default_selected, last_applied_quote_id)
SELECT 'nutresa', p.id, true, 'ab9c0c14-a27e-4317-9995-dfb4ba9bcb80'
FROM public.profiles p
WHERE p.id = 'd7ab7eb8-d9ec-446b-937a-f08bc209e476'
   OR p.parent_id = 'd7ab7eb8-d9ec-446b-937a-f08bc209e476'
ON CONFLICT (model_id, client_id) DO NOTHING;

-- 5.2 Clientes de COLSUBSIDIO (Casa Matriz Colsubsidio + todas sus sucursales hijas)
INSERT INTO public.special_agreement_model_clients (model_id, client_id, is_default_selected, last_applied_quote_id)
SELECT 'colsubsidio', p.id, true, '5afc3173-4ced-4635-a71f-56ef57e144f8'
FROM public.profiles p
WHERE p.id = '54b72961-2362-49d9-906b-df78ef944d7e'
   OR p.parent_id = '54b72961-2362-49d9-906b-df78ef944d7e'
ON CONFLICT (model_id, client_id) DO NOTHING;

-- 5.3 Cohorte de Clientes de LISTA GENERAL QUINCENAL (Los 27 clientes con acuerdos de ciclo quincenal en quotes)
INSERT INTO public.special_agreement_model_clients (model_id, client_id, is_default_selected, last_applied_quote_id)
SELECT DISTINCT 'general_quincenal', q.client_id, true, q.id
FROM public.quotes q
WHERE q.status = 'agreement'
  AND q.client_id IS NOT NULL
  AND q.client_id NOT IN ('d7ab7eb8-d9ec-446b-937a-f08bc209e476', '54b72961-2362-49d9-906b-df78ef944d7e')
  AND q.valid_until IN ('2026-10-15', '2026-10-16', '2026-09-14', '2026-09-18')
ON CONFLICT (model_id, client_id) DO NOTHING;

-- 5.4 Cohorte de Clientes de LISTA GENERAL MENSUAL (Clientes con acuerdos de ciclo mensual a fin de mes en quotes + vinculados a #165)
INSERT INTO public.special_agreement_model_clients (model_id, client_id, is_default_selected, last_applied_quote_id)
SELECT DISTINCT 'general_mensual', q.client_id, true, q.id
FROM public.quotes q
WHERE q.status = 'agreement'
  AND q.client_id IS NOT NULL
  AND q.client_id NOT IN ('d7ab7eb8-d9ec-446b-937a-f08bc209e476', '54b72961-2362-49d9-906b-df78ef944d7e')
  AND q.valid_until IN ('2026-10-31', '2026-11-01', '2026-09-30', '2026-10-26')
ON CONFLICT (model_id, client_id) DO NOTHING;

-- 6. FUNCIÓN RPC ATÓMICA PARA APLICAR PRECIOS Y VIGENCIA DE UN MODELO A LOS CLIENTES SELECCIONADOS (SINGLE SOURCE OF TRUTH)
CREATE OR REPLACE FUNCTION public.apply_special_agreement_to_clients(
    p_model_id text,
    p_start_date date,
    p_valid_until date,
    p_selected_client_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_master_quote_id uuid;
    v_expanded_client_ids uuid[];
    v_client_id uuid;
    v_applied_count integer := 0;
BEGIN
    -- 1. Obtener acuerdo maestro del modelo
    SELECT master_quote_id INTO v_master_quote_id
    FROM public.special_agreement_models
    WHERE id = p_model_id;

    -- 2. Expandir automáticamente Casas Matrices hacia sus sucursales vinculadas
    SELECT COALESCE(array_agg(DISTINCT p.id), ARRAY[]::uuid[])
    INTO v_expanded_client_ids
    FROM public.profiles p
    WHERE p.id = ANY(COALESCE(p_selected_client_ids, ARRAY[]::uuid[]))
       OR p.parent_id = ANY(COALESCE(p_selected_client_ids, ARRAY[]::uuid[]));

    -- 3. Actualizar fechas en el modelo y en la cabecera maestra de quotes
    UPDATE public.special_agreement_models
    SET start_date = p_start_date,
        valid_until = p_valid_until,
        updated_at = now()
    WHERE id = p_model_id;

    IF v_master_quote_id IS NOT NULL THEN
        UPDATE public.quotes
        SET start_date = p_start_date,
            valid_until = p_valid_until,
            updated_at = now()
        WHERE id = v_master_quote_id;

        -- Sincronizar app_settings para paridad Cero Split-Brain con Acuerdos Comerciales y resolve-agreement-pricing
        INSERT INTO public.app_settings (key, value, description, updated_at)
        VALUES (
            'agreement_clients:' || v_master_quote_id::text,
            to_jsonb(v_expanded_client_ids)::text,
            'Clientes vinculados al modelo especial ' || p_model_id,
            now()
        )
        ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = now();
    END IF;

    -- 4. Limpiar puntero active_master_agreement_id de los clientes que fueron desvinculados de este modelo
    IF v_master_quote_id IS NOT NULL THEN
        UPDATE public.profiles pr
        SET logistics_data = (COALESCE(pr.logistics_data, '{}'::jsonb) - 'active_master_agreement_id') - 'special_agreement_model_id'
        WHERE pr.id IN (
            SELECT samc.client_id
            FROM public.special_agreement_model_clients samc
            WHERE samc.model_id = p_model_id
              AND NOT (samc.client_id = ANY(v_expanded_client_ids))
        )
          AND COALESCE(pr.logistics_data->>'active_master_agreement_id', '') = v_master_quote_id::text;
    END IF;

    -- 5. Depurar clientes desmarcados del padrón del modelo
    DELETE FROM public.special_agreement_model_clients
    WHERE model_id = p_model_id
      AND NOT (client_id = ANY(v_expanded_client_ids));

    -- 6. Inscribir clientes seleccionados, actualizar puntero en profiles y marcar fotocopias individuales antiguas como 'superseded'
    IF array_length(v_expanded_client_ids, 1) > 0 THEN
        FOREACH v_client_id IN ARRAY v_expanded_client_ids LOOP
            INSERT INTO public.special_agreement_model_clients (model_id, client_id, is_default_selected, last_applied_at, last_applied_quote_id)
            VALUES (p_model_id, v_client_id, true, now(), v_master_quote_id)
            ON CONFLICT (model_id, client_id) DO UPDATE SET
                is_default_selected = true,
                last_applied_at = now(),
                last_applied_quote_id = COALESCE(v_master_quote_id, public.special_agreement_model_clients.last_applied_quote_id);

            IF v_master_quote_id IS NOT NULL THEN
                UPDATE public.profiles
                SET logistics_data = COALESCE(logistics_data, '{}'::jsonb) || jsonb_build_object(
                    'active_master_agreement_id', v_master_quote_id,
                    'special_agreement_model_id', p_model_id
                )
                WHERE id = v_client_id;
            END IF;

            v_applied_count := v_applied_count + 1;
        END LOOP;

        -- Doctrina Single Source of Truth (SPEC.md §7.5.6.1 & Escenario 237.4): Marcar copias individuales antiguas como superseded
        IF v_master_quote_id IS NOT NULL THEN
            UPDATE public.quotes
            SET status = 'superseded',
                updated_at = now()
            WHERE client_id = ANY(v_expanded_client_ids)
              AND status = 'agreement'
              AND id <> v_master_quote_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'model_id', p_model_id,
        'master_quote_id', v_master_quote_id,
        'applied_clients_count', v_applied_count,
        'start_date', p_start_date,
        'valid_until', p_valid_until
    );
END;
$$;

COMMIT;
