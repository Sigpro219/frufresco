/**
 * Motor Algorítmico Autónomo de Atención Especial en Operación (Escenario 218 - SDD v1.9.186)
 *
 * Evalúa exclusivamente con DATOS REALES de base de datos el ciclo de vida de cada cliente
 * sin intervención humana manual y con protección estricta contra falsos positivos (Zero-Mock / Zero-Noise):
 *
 * 1. PQR RECURRENTE / ALERTA CALIDAD ('recurring_pqr'):
 *    - Gatillo: >= 1 PQR real registrada en `customer_service_pqrs` en los últimos 30 días
 *      (o en estado 'pending' / 'in_review'), o pedido de reposición real.
 *    - Graduación: Al completar 3 entregas posteriores sin reclamos (X/3).
 *
 * 2. CLIENTE NUEVO ('new_client'):
 *    - Gatillo: Perfil creado genuinamente en los últimos 14 días (`profile.created_at` <= 14d
 *      respecto a la fecha de entrega/evaluación), con <= 3 pedidos confirmados históricos
 *      y < 3 pedidos entregados. Excluye cuentas históricas antiguas migradas.
 *    - Graduación: Al completar 3 pedidos entregados sin novedades (X/3).
 *
 * 3. SEGUIMIENTO BAJO CONSUMO / RIESGO DE FUGA ('low_consumption'):
 *    - Gatillo: Evaluado únicamente sobre pedidos operativos confirmados (excluyendo borradores
 *      o `pending_approval` no aprobados). Requiere cliente habitual (>= 4 pedidos confirmados
 *      y >= 2 pedidos en la quincena previa) con caída real >= 30% en ventana de 14 días.
 *    - Graduación: Al completar 2 pedidos consecutivos recuperando su ritmo habitual (X/2).
 */

export type SpecialAttentionReason = 'new_client' | 'recurring_pqr' | 'low_consumption';

export interface SpecialAttentionDirective {
    key: 'selection' | 'weight' | 'specs' | 'crates';
    label: string;
    detail: string;
}

export interface SpecialAttentionState {
    active: boolean;
    isActive: boolean;
    reason: SpecialAttentionReason;
    code: SpecialAttentionReason;
    shortTag: 'NUE' | 'PQR' | 'SEG';
    badgeShort: string;
    printStamp: 'NUE' | 'PQR' | 'SEG';
    printCode: 'NUE' | 'PQR' | 'SEG';
    title: string;
    subtitle: string;
    reasonText: string;
    currentProgress: number;
    targetProgress: number;
    progressLabel: string;
    colors: {
        bg: string;
        border: string;
        text: string;
        darkBg: string;
        darkBorder: string;
        darkText: string;
    };
    directives: SpecialAttentionDirective[];
}

export type SpecialClientAttentionState = SpecialAttentionState;

export const STANDARD_CARE_DIRECTIVES: SpecialAttentionDirective[] = [
    {
        key: 'selection',
        label: 'Selección 1A',
        detail: 'Escoger lote fresco sin magulladuras'
    },
    {
        key: 'weight',
        label: 'Peso Exacto',
        detail: 'Verificación estricta en báscula'
    },
    {
        key: 'specs',
        label: 'Calibre / Punto',
        detail: 'Calibre y punto de madurez pedidos'
    },
    {
        key: 'crates',
        label: 'Canasta Limpia',
        detail: 'Lavada, desinfectada y seca'
    }
];

const REASON_PALETTES: Record<SpecialAttentionReason, SpecialAttentionState['colors']> = {
    new_client: {
        bg: '#FEF3C7',
        border: '#F59E0B',
        text: '#B45309',
        darkBg: 'rgba(245, 158, 11, 0.16)',
        darkBorder: '#F59E0B',
        darkText: '#FCD34D'
    },
    recurring_pqr: {
        bg: '#FEE2E2',
        border: '#EF4444',
        text: '#B91C1C',
        darkBg: 'rgba(239, 68, 68, 0.18)',
        darkBorder: '#EF4444',
        darkText: '#FCA5A5'
    },
    low_consumption: {
        bg: '#E0E7FF',
        border: '#6366F1',
        text: '#4338CA',
        darkBg: 'rgba(99, 102, 241, 0.18)',
        darkBorder: '#6366F1',
        darkText: '#A5B4FC'
    }
};

const CONFIRMED_OPERATIONAL_STATUSES = new Set([
    'recibido',
    'para_compra',
    'approved',
    'picking',
    'in_preparation',
    'shipped',
    'delivered',
    'completed',
    'facturado'
]);

export interface EvaluateSpecialAttentionParams {
    profileId?: string | null;
    profile?: any;
    order?: any;
    /** Todos los pedidos históricos conocidos de este cliente */
    clientOrders?: Array<{
        id: string;
        created_at?: string;
        delivery_date?: string;
        status?: string;
        total?: number;
        subtotal?: number;
        total_weight_kg?: number;
        admin_notes?: string;
        special_notes?: string;
        logistics_data?: any;
    }>;
    /** PQRs reales registradas para este cliente en customer_service_pqrs */
    clientPqrs?: Array<{
        id: string;
        created_at: string;
        status?: string;
        subject?: string;
        order_id?: string;
        primary_photo_url?: string;
    }>;
    /** Porcentaje de variación de consumo si ya fue calculado sobre órdenes confirmadas */
    growthPct?: number;
    /** Número total de pedidos históricos confirmados */
    totalHistoricalOrdersCount?: number;
}

export function evaluateSpecialClientAttention(params: EvaluateSpecialAttentionParams): SpecialAttentionState | null {
    const {
        profile,
        order,
        clientOrders = [],
        clientPqrs = [],
        growthPct,
        totalHistoricalOrdersCount
    } = params;

    // 0. Verificar si existe un override explícito en logistics_data
    const explicitConfig =
        order?.logistics_data?.special_attention ||
        profile?.logistics_data?.special_attention ||
        (profile?.active !== undefined && profile?.reason ? profile : undefined);

    if (explicitConfig && (explicitConfig.active === false || explicitConfig.mode === 'disabled')) {
        return null;
    }

    // Si está configurado explícitamente en modo manual activo
    if (explicitConfig && explicitConfig.active === true && (explicitConfig.mode === 'manual' || explicitConfig.is_manual)) {
        const rawReason = explicitConfig.reason || 'custom';
        const reason: SpecialAttentionReason = rawReason === 'custom' ? 'recurring_pqr' : rawReason;
        const shortTagMap: Record<string, 'NUE' | 'PQR' | 'SEG'> = {
            new_client: 'NUE',
            recurring_pqr: 'PQR',
            low_consumption: 'SEG',
            custom: 'PQR'
        };
        const titleMap: Record<string, string> = {
            new_client: 'Cliente Nuevo (Manual)',
            recurring_pqr: 'Alerta de Calidad / PQR (Manual)',
            low_consumption: 'Seguimiento por Bajo Consumo (Manual)',
            custom: 'Atención Especial Requerida'
        };
        const shortTag = shortTagMap[rawReason] || 'PQR';
        const title = explicitConfig.title || titleMap[rawReason] || 'Atención Especial';
        const subtitle = explicitConfig.custom_notes || explicitConfig.subtitle || 'Instrucción operativa manual para bodega y logística.';

        const activeDirectives = STANDARD_CARE_DIRECTIVES.filter(d => {
            if (explicitConfig.directives && typeof explicitConfig.directives === 'object') {
                return explicitConfig.directives[d.key] !== false;
            }
            return true;
        });

        const palette = REASON_PALETTES[reason] || REASON_PALETTES.recurring_pqr;

        return {
            active: true,
            isActive: true,
            reason,
            code: reason,
            shortTag,
            badgeShort: `${shortTag} · MANUAL`,
            printStamp: shortTag,
            printCode: shortTag,
            title,
            subtitle,
            reasonText: subtitle,
            currentProgress: 1,
            targetProgress: 1,
            progressLabel: 'MANUAL',
            colors: palette,
            directives: activeDirectives.length > 0 ? activeDirectives : STANDARD_CARE_DIRECTIVES
        };
    }

    // Fecha de referencia: fecha de entrega de la orden evaluada o fecha actual
    const refDateStr = order?.delivery_date || order?.created_at;
    const refDate = refDateStr
        ? new Date(refDateStr.length === 10 ? `${refDateStr}T12:00:00Z` : refDateStr)
        : new Date();
    const refMs = isNaN(refDate.getTime()) ? Date.now() : refDate.getTime();

    const ms14d = 14 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    // Filtrar exclusivamente órdenes operativas confirmadas (excluye pending_approval no aprobados y cancelados)
    const confirmedOrders = clientOrders
        .filter(o => o.status && CONFIRMED_OPERATIONAL_STATUSES.has(o.status))
        .sort((a, b) => {
            const da = new Date(a.delivery_date || a.created_at || 0).getTime();
            const db = new Date(b.delivery_date || b.created_at || 0).getTime();
            return da - db;
        });

    const deliveredOrders = confirmedOrders.filter(
        o => o.status === 'delivered' || o.status === 'completed' || o.status === 'facturado'
    );

    const totalConfirmedCount =
        totalHistoricalOrdersCount !== undefined
            ? totalHistoricalOrdersCount
            : Math.max(confirmedOrders.length, Number(profile?.total_orders || 0));

    // =========================================================================
    // 1. PRIORIDAD MÁXIMA: PQR RECURRENTE / ALERTA DE CALIDAD (Datos Reales)
    // =========================================================================
    const genuinePqrs = clientPqrs.filter(p => {
        // Excluir cualquier registro sintético residual
        if (p.primary_photo_url && p.primary_photo_url.includes('unsplash.com')) return false;
        const pMs = new Date(p.created_at).getTime();
        if (isNaN(pMs)) return false;
        return (refMs - pMs <= ms30d && pMs <= refMs + ms14d) || p.status === 'pending' || p.status === 'in_review';
    });

    if (genuinePqrs.length > 0 || explicitConfig?.reason === 'recurring_pqr') {
        const latestPqrTime = genuinePqrs.reduce((max, p) => {
            const t = new Date(p.created_at).getTime();
            return t > max ? t : max;
        }, 0);

        const pqrOrderIds = new Set(genuinePqrs.map(p => p.order_id).filter(Boolean));

        // Contar entregas posteriores sin PQR hasta la fecha de referencia
        const cleanOrdersAfterPqr = deliveredOrders.filter(o => {
            const oTime = new Date(o.delivery_date || o.created_at || 0).getTime();
            return oTime > latestPqrTime && oTime <= refMs && !pqrOrderIds.has(o.id);
        }).length;

        if (cleanOrdersAfterPqr < 3) {
            const currentStep = Math.min(3, cleanOrdersAfterPqr + 1);
            const pqrSubject = genuinePqrs[0]?.subject ? ` (${genuinePqrs[0].subject})` : '';
            const subtitle =
                genuinePqrs.length > 1
                    ? `${genuinePqrs.length} reclamos reales recientes${pqrSubject}. Entrega ${currentStep}/3 sin novedad para superar alerta.`
                    : `Reclamo registrado${pqrSubject}. Entrega ${currentStep}/3 sin novedad para superar alerta.`;
            return {
                active: true,
                isActive: true,
                reason: 'recurring_pqr',
                code: 'recurring_pqr',
                shortTag: 'PQR',
                badgeShort: `PQR · ${currentStep}/3`,
                printStamp: 'PQR',
                printCode: 'PQR',
                title: 'Cuidado por PQR Reciente',
                subtitle,
                reasonText: subtitle,
                currentProgress: currentStep,
                targetProgress: 3,
                progressLabel: `${currentStep}/3`,
                colors: REASON_PALETTES.recurring_pqr,
                directives: STANDARD_CARE_DIRECTIVES
            };
        }
    }

    // =========================================================================
    // 2. SEGUNDA PRIORIDAD: CLIENTE NUEVO REAL (Creado <= 14 días y <= 3 pedidos)
    // =========================================================================
    const isExplicitNew = explicitConfig?.reason === 'new_client' && explicitConfig?.active === true;

    // Verificar fecha real de creación del perfil en base de datos
    const profileCreatedStr = profile?.created_at;
    const profileCreatedMs = profileCreatedStr ? new Date(profileCreatedStr).getTime() : 0;
    const isGenuinelyRecentProfile =
        profileCreatedMs > 0 &&
        refMs - profileCreatedMs <= ms14d &&
        refMs - profileCreatedMs >= -ms14d;

    // Evitar marcar sucursales nuevas de grandes cadenas históricas consolidadas (ej. Colsubsidio / Compensar)
    const rawCompanyUpper = String(profile?.company_name || profile?.contact_name || '').toUpperCase();
    const isLegacyCorporateChain =
        rawCompanyUpper.includes('COLSUBSIDIO') ||
        rawCompanyUpper.includes('COMPENSAR') ||
        rawCompanyUpper.includes('PUERTO PEÑALISA') ||
        rawCompanyUpper.includes('PUERTO PENALISA');

    const deliveredUpToRef = deliveredOrders.filter(o => {
        const oTime = new Date(o.delivery_date || o.created_at || 0).getTime();
        return oTime < refMs;
    }).length;

    if (
        isExplicitNew ||
        (isGenuinelyRecentProfile &&
            !isLegacyCorporateChain &&
            totalConfirmedCount > 0 &&
            totalConfirmedCount <= 3 &&
            deliveredUpToRef < 3)
    ) {
        const currentStep = Math.min(3, Math.max(1, deliveredUpToRef + 1));
        const subtitle = `Cuenta creada recientemente. Pedido ${currentStep} de 3 de bienvenida para fidelizar cliente.`;
        return {
            active: true,
            isActive: true,
            reason: 'new_client',
            code: 'new_client',
            shortTag: 'NUE',
            badgeShort: `NUE · ${currentStep}/3`,
            printStamp: 'NUE',
            printCode: 'NUE',
            title: 'Cliente Nuevo · Onboarding',
            subtitle,
            reasonText: subtitle,
            currentProgress: currentStep,
            targetProgress: 3,
            progressLabel: `${currentStep}/3`,
            colors: REASON_PALETTES.new_client,
            directives: STANDARD_CARE_DIRECTIVES
        };
    }

    // =========================================================================
    // 3. TERCERA PRIORIDAD: SEGUIMIENTO POR BAJO CONSUMO REAL (Ventana 14d)
    // =========================================================================
    let isLowConsumption = explicitConfig?.reason === 'low_consumption' && explicitConfig?.active === true;
    let computedDropPct: number | null = null;

    if (!isLowConsumption && typeof growthPct === 'number' && growthPct <= -30 && totalConfirmedCount >= 4) {
        isLowConsumption = true;
        computedDropPct = Math.round(growthPct);
    }

    // Evaluación sobre órdenes operativas confirmadas en ventana de 14 días vs 14 días previos
    if (!isLowConsumption && confirmedOrders.length >= 4) {
        const recent14dOrders = confirmedOrders.filter(o => {
            const dStr = o.delivery_date || (o.created_at ? o.created_at.slice(0, 10) : '');
            const t = new Date(dStr.length === 10 ? `${dStr}T12:00:00Z` : dStr).getTime();
            return t > refMs - ms14d && t <= refMs;
        });
        const prev14dOrders = confirmedOrders.filter(o => {
            const dStr = o.delivery_date || (o.created_at ? o.created_at.slice(0, 10) : '');
            const t = new Date(dStr.length === 10 ? `${dStr}T12:00:00Z` : dStr).getTime();
            return t > refMs - 2 * ms14d && t <= refMs - ms14d;
        });

        // Exigir al menos 2 pedidos confirmados en la quincena previa para evitar sesgo por pedido único atípico
        if (prev14dOrders.length >= 2 && recent14dOrders.length >= 1) {
            const recentSum = recent14dOrders.reduce((acc, o) => acc + Number(o.total || o.subtotal || 0), 0);
            const prevSum = prev14dOrders.reduce((acc, o) => acc + Number(o.total || o.subtotal || 0), 0);

            if (prevSum > 0) {
                const pct = Math.round(((recentSum - prevSum) / prevSum) * 100);
                if (pct <= -30) {
                    isLowConsumption = true;
                    computedDropPct = pct;
                }
            }
        }
    }

    if (isLowConsumption) {
        const recoveryStep = explicitConfig?.lifecycle?.current_clean_orders
            ? Math.min(2, Number(explicitConfig.lifecycle.current_clean_orders))
            : 1;
        const dropText =
            computedDropPct !== null && computedDropPct < 0
                ? `Variación real de consumo (${computedDropPct}%) en últimos 14 días.`
                : 'Disminución verificada en volumen de pedidos confirmados.';
        const subtitle = `${dropText} Entrega ${recoveryStep} de 2 de seguimiento.`;

        return {
            active: true,
            isActive: true,
            reason: 'low_consumption',
            code: 'low_consumption',
            shortTag: 'SEG',
            badgeShort: `SEG · ${recoveryStep}/2`,
            printStamp: 'SEG',
            printCode: 'SEG',
            title: 'Seguimiento por Bajo Consumo',
            subtitle,
            reasonText: subtitle,
            currentProgress: recoveryStep,
            targetProgress: 2,
            progressLabel: `${recoveryStep}/2`,
            colors: REASON_PALETTES.low_consumption,
            directives: STANDARD_CARE_DIRECTIVES
        };
    }

    return null;
}

/**
 * Construye un diccionario O(1) por profile_id con el estado de Atención Especial
 * a partir de las órdenes confirmadas, PQRs reales y mapa de perfiles.
 * Soporta tanto (orders, pqrs, profilesMap) como (profileIds, orders, pqrs, profilesOrOverridesMap).
 */
export function buildSpecialAttentionByProfileMap(
    firstArg: any[],
    secondArg: any[] = [],
    thirdArg?: any,
    fourthArg?: Record<string, any>
): Record<string, SpecialAttentionState> {
    const isProfileIdsFirst =
        Array.isArray(firstArg) &&
        (firstArg.length === 0 || typeof firstArg[0] === 'string') &&
        Array.isArray(thirdArg);

    const explicitProfileIds: string[] = isProfileIdsFirst ? firstArg : [];
    const orders: any[] = isProfileIdsFirst ? secondArg : firstArg;
    const pqrs: any[] = isProfileIdsFirst ? (thirdArg || []) : secondArg;
    const profilesMap: Record<string, any> | undefined = isProfileIdsFirst ? fourthArg : thirdArg;

    const ordersByProfile: Record<string, any[]> = {};
    const pqrsByProfile: Record<string, any[]> = {};

    for (const o of orders || []) {
        const pid = o.profile_id || o.profiles?.id;
        if (!pid) continue;
        if (!ordersByProfile[pid]) ordersByProfile[pid] = [];
        ordersByProfile[pid].push(o);
    }

    for (const p of pqrs || []) {
        const pid = p.client_id || p.client_profile_id || p.profile_id;
        if (!pid) continue;
        if (!pqrsByProfile[pid]) pqrsByProfile[pid] = [];
        pqrsByProfile[pid].push(p);
    }

    const result: Record<string, SpecialAttentionState> = {};
    const allProfileIds = new Set([
        ...explicitProfileIds,
        ...Object.keys(ordersByProfile),
        ...Object.keys(pqrsByProfile)
    ]);

    for (const pid of allProfileIds) {
        const cOrders = ordersByProfile[pid] || [];
        const cPqrs = pqrsByProfile[pid] || [];
        // Usar la orden más reciente como orden de referencia para la fecha de evaluación
        const sortedOrders = [...cOrders].sort((a, b) => {
            const da = new Date(a.delivery_date || a.created_at || 0).getTime();
            const db = new Date(b.delivery_date || b.created_at || 0).getTime();
            return db - da;
        });
        const refOrder = sortedOrders[0];
        const prof = profilesMap?.[pid] || refOrder?.profiles;

        const state = evaluateSpecialClientAttention({
            profileId: pid,
            profile: prof,
            order: refOrder,
            clientOrders: cOrders,
            clientPqrs: cPqrs
        });

        if (state && state.active) {
            result[pid] = state;
        }
    }

    return result;
}
