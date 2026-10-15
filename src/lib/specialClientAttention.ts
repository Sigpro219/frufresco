/**
 * Motor Algorítmico Autónomo de Atención Especial en Operación (Escenario 218 - SDD v1.9.186)
 *
 * Evalúa automáticamente el ciclo de vida de cada cliente sin intervención humana manual,
 * previniendo la fatiga de alarmas (Alarm Fatigue) mediante condiciones claras de graduación:
 *
 * 1. CLIENTE NUEVO ('new_client'):
 *    - Gatillo: <= 2 pedidos entregados históricamente (primeros 3 pedidos).
 *    - Graduación: Al completar 3 pedidos entregados sin novedades (X/3).
 *
 * 2. PQR RECURRENTE / ALERTA CALIDAD ('recurring_pqr'):
 *    - Gatillo: >= 1 PQR o reclamo registrado en los últimos 15 días.
 *    - Graduación: Al completar 3 entregas consecutivas posteriores sin reclamos (X/3).
 *
 * 3. SEGUIMIENTO BAJO CONSUMO / RIESGO DE FUGA ('low_consumption'):
 *    - Gatillo: Ventana corta de 7 a 14 días con caída > 20% en facturación/volumen
 *      respecto al periodo equivalente anterior (o > 7 días sin pedir en cliente habitual con >= 3 pedidos).
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
    shortTag: 'Nuevo' | 'PQR' | 'Consumo';
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
        label: 'Características',
        detail: 'Calibre y punto de madurez pedidos'
    },
    {
        key: 'crates',
        label: 'Canastilla Limpia',
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

export interface EvaluateSpecialAttentionParams {
    profileId?: string | null;
    profile?: any;
    order?: any;
    /** Todos los pedidos históricos conocidos de este cliente (ordenados o sin ordenar) */
    clientOrders?: Array<{
        id: string;
        created_at?: string;
        delivery_date?: string;
        status?: string;
        total?: number;
        total_weight_kg?: number;
    }>;
    /** PQRs registradas para este cliente en los últimos 15-30 días */
    clientPqrs?: Array<{
        id: string;
        created_at: string;
        status?: string;
        subject?: string;
        order_id?: string;
    }>;
    /** Porcentaje de variación de consumo si ya fue calculado por el motor comercial */
    growthPct?: number;
    /** Número total de pedidos históricos si no se pasa el array completo */
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
    const explicitConfig = order?.logistics_data?.special_attention || profile?.logistics_data?.special_attention || (profile?.active !== undefined ? profile : undefined);
    if (explicitConfig && explicitConfig.active === false) {
        return null;
    }

    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

    // Filtrar pedidos válidos (no cancelados)
    const validOrders = clientOrders
        .filter(o => o.status !== 'cancelled' && o.status !== 'rejected')
        .sort((a, b) => {
            const da = new Date(a.delivery_date || a.created_at || 0).getTime();
            const db = new Date(b.delivery_date || b.created_at || 0).getTime();
            return da - db;
        });

    const deliveredOrders = validOrders.filter(o =>
        o.status === 'delivered' || o.status === 'completed' || o.status === 'facturado'
    );

    const totalOrdersCount = totalHistoricalOrdersCount !== undefined
        ? totalHistoricalOrdersCount
        : Math.max(validOrders.length, Number(profile?.total_orders || 0));

    // =========================================================================
    // 1. PRIORIDAD MÁXIMA: PQR RECURRENTE / ALERTA DE CALIDAD (Últimos 15 días)
    // =========================================================================
    const recentPqrs = clientPqrs.filter(p => {
        const pDate = new Date(p.created_at);
        return pDate >= fifteenDaysAgo || p.status === 'pending' || p.status === 'in_review';
    });

    if (recentPqrs.length > 0 || explicitConfig?.reason === 'recurring_pqr') {
        // Encontrar la fecha de la PQR más reciente
        const latestPqrTime = recentPqrs.reduce((max, p) => {
            const t = new Date(p.created_at).getTime();
            return t > max ? t : max;
        }, 0);

        const pqrOrderIds = new Set(recentPqrs.map(p => p.order_id).filter(Boolean));

        // Contar pedidos entregados sin PQR posteriores al último reclamo
        const cleanOrdersAfterPqr = deliveredOrders.filter(o => {
            const oTime = new Date(o.delivery_date || o.created_at || 0).getTime();
            return oTime > latestPqrTime && !pqrOrderIds.has(o.id);
        }).length;

        // Si ya completó 3 pedidos limpios posteriores a la PQR, se gradúa automáticamente
        if (cleanOrdersAfterPqr < 3) {
            const currentStep = Math.min(3, cleanOrdersAfterPqr + 1);
            const subtitle = recentPqrs.length > 1
                ? `${recentPqrs.length} reclamos en los últimos 15 días. Entrega ${currentStep} de 3 sin novedad para superar alerta.`
                : `Reclamo registrado en los últimos 15 días. Entrega ${currentStep} de 3 sin novedad para superar alerta.`;
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
    // 2. SEGUNDA PRIORIDAD: CLIENTE NUEVO (Onboarding primeros 3 pedidos)
    // =========================================================================
    const isExplicitNew = explicitConfig?.reason === 'new_client' && explicitConfig?.active === true;
    const deliveredCount = deliveredOrders.length > 0 ? deliveredOrders.length : (totalOrdersCount > 0 ? totalOrdersCount - 1 : 0);

    if (isExplicitNew || (totalOrdersCount > 0 && totalOrdersCount <= 3 && deliveredCount < 3)) {
        const currentStep = Math.min(3, Math.max(1, deliveredCount + 1));
        const subtitle = `Pedido ${currentStep} de 3 de bienvenida. Cuidar primera impresión para fidelizar la cuenta.`;
        return {
            active: true,
            isActive: true,
            reason: 'new_client',
            code: 'new_client',
            shortTag: 'Nuevo',
            badgeShort: `Nuevo · ${currentStep}/3`,
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
    // 3. TERCERA PRIORIDAD: SEGUIMIENTO POR BAJO CONSUMO (Ventana corta 7-14d)
    // =========================================================================
    let isLowConsumption = explicitConfig?.reason === 'low_consumption' && explicitConfig?.active === true;
    let computedDropPct = typeof growthPct === 'number' ? growthPct : null;

    if (!isLowConsumption && computedDropPct !== null && computedDropPct <= -20 && totalOrdersCount >= 3) {
        isLowConsumption = true;
    }

    // Si no nos pasaron growthPct pero tenemos el historial de órdenes del cliente (ventana 14 días vs 14 días previos)
    if (!isLowConsumption && computedDropPct === null && validOrders.length >= 3) {
        const ms7d = 7 * 24 * 60 * 60 * 1000;
        const ms14d = 14 * 24 * 60 * 60 * 1000;
        const nowMs = now.getTime();

        const recent14dOrders = validOrders.filter(o => {
            const t = new Date(o.delivery_date || o.created_at || 0).getTime();
            return t >= nowMs - ms14d && t <= nowMs + ms7d;
        });
        const prev14dOrders = validOrders.filter(o => {
            const t = new Date(o.delivery_date || o.created_at || 0).getTime();
            return t >= nowMs - (2 * ms14d) && t < nowMs - ms14d;
        });

        const recentSum = recent14dOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
        const prevSum = prev14dOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);

        if (prevSum > 0) {
            const pct = Math.round(((recentSum - prevSum) / prevSum) * 100);
            if (pct <= -20) {
                isLowConsumption = true;
                computedDropPct = pct;
            }
        }
    }

    if (isLowConsumption) {
        const recoveryStep = explicitConfig?.lifecycle?.current_clean_orders
            ? Math.min(2, Number(explicitConfig.lifecycle.current_clean_orders))
            : 1;
        const dropText = computedDropPct !== null && computedDropPct < 0
            ? `Caída de consumo (${computedDropPct}%) en ventana de 14 días.`
            : 'Disminución reciente en frecuencia o volumen de pedidos.';
        const subtitle = `${dropText} Pedido ${recoveryStep} de 2 para recuperación de cuenta.`;

        return {
            active: true,
            isActive: true,
            reason: 'low_consumption',
            code: 'low_consumption',
            shortTag: 'Consumo',
            badgeShort: `Consumo · ${recoveryStep}/2`,
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
 * a partir de una lista de órdenes y PQRs recientes.
 * Soporta tanto (orders, pqrs, profilesMap) como (profileIds, orders, pqrs, overridesMap).
 */
export function buildSpecialAttentionByProfileMap(
    firstArg: any[],
    secondArg: any[] = [],
    thirdArg?: any,
    fourthArg?: Record<string, any>
): Record<string, SpecialAttentionState> {
    const isProfileIdsFirst = Array.isArray(firstArg) && (firstArg.length === 0 || typeof firstArg[0] === 'string') && Array.isArray(thirdArg);

    const explicitProfileIds: string[] = isProfileIdsFirst ? firstArg : [];
    const orders: any[] = isProfileIdsFirst ? secondArg : firstArg;
    const pqrs: any[] = isProfileIdsFirst ? (thirdArg || []) : secondArg;
    const profilesMap: Record<string, any> | undefined = isProfileIdsFirst ? fourthArg : thirdArg;

    const ordersByProfile: Record<string, any[]> = {};
    const pqrsByProfile: Record<string, any[]> = {};

    for (const o of (orders || [])) {
        const pid = o.profile_id || o.profiles?.id;
        if (!pid) continue;
        if (!ordersByProfile[pid]) ordersByProfile[pid] = [];
        ordersByProfile[pid].push(o);
    }

    for (const p of (pqrs || [])) {
        const pid = p.client_profile_id || p.client_id || p.profile_id;
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
        const sampleOrder = cOrders[0];
        const prof = profilesMap?.[pid] || sampleOrder?.profiles;

        const state = evaluateSpecialClientAttention({
            profileId: pid,
            profile: prof,
            order: sampleOrder,
            clientOrders: cOrders,
            clientPqrs: cPqrs
        });

        if (state && state.active) {
            result[pid] = state;
        }
    }

    return result;
}
