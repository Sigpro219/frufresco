/**
 * costFreshnessPolicy.ts
 * Políticas de Frescura y Acuerdos de Nivel de Servicio (SLA) de Costos por Pareto de Frecuencia
 * FruFresco - Módulo Comercial & Abastecimiento (SPEC v1.7.0)
 * 
 * Regla de Pareto:
 * - Tercil 1 (T1): Top 33% mayor frecuencia transaccional (compras/movimientos). SLA: 4 días.
 * - Tercil 2 (T2): 33% intermedio de frecuencia transaccional. SLA: 8 días.
 * - Tercil 3 (T3): 34% menor frecuencia / catálogo extendido. SLA: 15 días.
 */

export type ParetoTercil = 'T1' | 'T2' | 'T3';
export type FreshnessClass = ParetoTercil | 'A' | 'B' | 'C';

export interface FreshnessSLA {
    perishabilityClass: FreshnessClass;
    tercil?: ParetoTercil;
    classLabel: string;
    validDaysMax: number;    // Días hasta los cuales se considera costo 100% fresco / vigente
    dueSoonDaysMax: number;  // Días a partir de los cuales se alerta por vencer
    description: string;
}

export type CostLifecycleStatus = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'SIN_REFERENCIA';

export interface ProductCostLifecycle {
    daysOld: number;
    status: CostLifecycleStatus;
    statusLabel: string;
    statusColor: string;
    statusBg: string;
    sourceLabel: string;
    signalDateFormatted: string;
    isExpired: boolean;
    isDueSoon: boolean;
    currentCost: number;
    tercil: ParetoTercil;
    sla: FreshnessSLA;
}

/**
 * Retorna el SLA canónico basado en el Tercil de Pareto (T1: 4d, T2: 8d, T3: 15d).
 * Mantiene compatibilidad hacia atrás si se recibe una categoría histórica ('HO', 'FR', 'DE').
 */
export function getFreshnessSLA(tercilOrCategory?: string | null): FreshnessSLA {
    const key = (tercilOrCategory || '').trim().toUpperCase();

    // Terciles Canónicos (SPEC v1.7.0)
    if (key === 'T1' || ['HO', 'VE', 'HI', 'HORTALIZA', 'VERDURA', 'HIERBA'].includes(key)) {
        return {
            perishabilityClass: 'T1',
            tercil: 'T1',
            classLabel: 'T1: Crítico / Pulso Diario (4d)',
            validDaysMax: 4,
            dueSoonDaysMax: 3,
            description: 'Alta frecuencia transaccional. SLA estricto de 4 días calendario.'
        };
    }

    if (key === 'T3' || ['DE', 'CO', 'PR', 'AB', 'DESPENSA', 'CONGELADO', 'PROCESADO', 'ABARROTES', 'SECOS'].includes(key)) {
        return {
            perishabilityClass: 'T3',
            tercil: 'T3',
            classLabel: 'T3: Baja Frecuencia / Quincenal (15d)',
            validDaysMax: 15,
            dueSoonDaysMax: 12,
            description: 'Baja frecuencia transaccional o catálogo extendido. SLA de 15 días calendario.'
        };
    }

    // Default: Tercil 2 (T2)
    return {
        perishabilityClass: 'T2',
        tercil: 'T2',
        classLabel: 'T2: Moderado / Semanal (8d)',
        validDaysMax: 8,
        dueSoonDaysMax: 6,
        description: 'Frecuencia transaccional moderada. SLA semanal de 8 días calendario.'
    };
}

/**
 * Calcula dinámicamente el Tercil de Pareto ('T1' | 'T2' | 'T3') para cada producto
 * en función de su frecuencia de compras/movimientos registrados.
 */
export function computeProductTerciles(
    productIds: string[],
    purchaseCounts: Record<string, number>
): Record<string, ParetoTercil> {
    if (!productIds || productIds.length === 0) return {};

    // Ordenar de mayor a menor frecuencia de compra
    const sorted = [...productIds].sort((a, b) => {
        const countA = purchaseCounts[a] || 0;
        const countB = purchaseCounts[b] || 0;
        return countB - countA;
    });

    const total = sorted.length;
    const t1Cutoff = Math.floor(total / 3);
    const t2Cutoff = Math.floor((total * 2) / 3);

    const tercilMap: Record<string, ParetoTercil> = {};

    sorted.forEach((id, idx) => {
        if (idx < t1Cutoff) {
            tercilMap[id] = 'T1';
        } else if (idx < t2Cutoff) {
            tercilMap[id] = 'T2';
        } else {
            tercilMap[id] = 'T3';
        }
    });

    return tercilMap;
}

/**
 * Evalúa el ciclo de vida y vigencia operativa del costo de un producto
 */
export function evaluateCostFreshness(
    latestSignalDate: Date | string | null | undefined,
    tercilOrCategory?: string | null,
    currentCost: number = 0,
    signalSource: 'COMPRAS' | 'MANUAL' | 'SIN_SEÑAL' = 'SIN_SEÑAL'
): ProductCostLifecycle {
    const sla = getFreshnessSLA(tercilOrCategory);
    const tercil = sla.tercil || 'T2';

    let dateObj: Date | null = null;
    if (latestSignalDate instanceof Date) {
        dateObj = isNaN(latestSignalDate.getTime()) ? null : latestSignalDate;
    } else if (typeof latestSignalDate === 'string' && latestSignalDate.trim().length > 0) {
        const parsed = new Date(latestSignalDate);
        dateObj = isNaN(parsed.getTime()) ? null : parsed;
    }

    if (!dateObj || currentCost <= 0) {
        return {
            daysOld: 999,
            status: 'SIN_REFERENCIA',
            statusLabel: 'Sin Referencia',
            statusColor: '#DC2626',
            statusBg: '#FEF2F2',
            sourceLabel: 'Sin Registro',
            signalDateFormatted: 'N/A',
            isExpired: true,
            isDueSoon: false,
            currentCost: currentCost || 0,
            tercil,
            sla
        };
    }

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const daysOld = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const formattedDate = dateObj.toISOString().slice(0, 10);
    const sourceText = signalSource === 'COMPRAS' ? 'Orden Compra' : signalSource === 'MANUAL' ? 'Carga Masiva / Manual' : 'Registro BD';

    if (daysOld <= sla.validDaysMax) {
        const isDueSoon = daysOld >= sla.dueSoonDaysMax;
        if (isDueSoon) {
            return {
                daysOld,
                status: 'POR_VENCER',
                statusLabel: `Por Vencer (${daysOld}d / máx ${sla.validDaysMax}d)`,
                statusColor: '#D97706',
                statusBg: '#FFFBEB',
                sourceLabel: sourceText,
                signalDateFormatted: formattedDate,
                isExpired: false,
                isDueSoon: true,
                currentCost,
                tercil,
                sla
            };
        }
        return {
            daysOld,
            status: 'VIGENTE',
            statusLabel: `Vigente (${daysOld}d / máx ${sla.validDaysMax}d)`,
            statusColor: '#059669',
            statusBg: '#ECFDF5',
            sourceLabel: sourceText,
            signalDateFormatted: formattedDate,
            isExpired: false,
            isDueSoon: false,
            currentCost,
            tercil,
            sla
        };
    } else {
        return {
            daysOld,
            status: 'VENCIDO',
            statusLabel: `Vencido (${daysOld}d / máx ${sla.validDaysMax}d)`,
            statusColor: '#DC2626',
            statusBg: '#FEF2F2',
            sourceLabel: sourceText,
            signalDateFormatted: formattedDate,
            isExpired: true,
            isDueSoon: false,
            currentCost,
            tercil,
            sla
        };
    }
}

