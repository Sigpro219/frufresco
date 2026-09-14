/**
 * costFreshnessPolicy.ts
 * Políticas de Frescura y Acuerdos de Nivel de Servicio (SLA) de Costos por Categoría
 * FruFresco - Módulo Comercial & Abastecimiento
 */

export type FreshnessClass = 'A' | 'B' | 'C';

export interface FreshnessSLA {
    perishabilityClass: FreshnessClass;
    classLabel: string;
    validDaysMax: number;    // Días hasta los cuales se considera costo 100% fresco / vigente
    dueSoonDaysMax: number;  // Días hasta los cuales se alerta por vencer antes de considerarse obsoleto
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
    sla: FreshnessSLA;
}

/**
 * Mapeo de categorías a clases de perecibilidad:
 * - Clase A (Hiperperecederos: Hortalizas, Verduras de hoja, Hierbas, Flores comestibles):
 *   Alta volatilidad en Corabastos. SLA: Vigente <= 4d, Por vencer 5-7d, Vencido > 7d.
 * - Clase B (Semi-perecederos: Frutas, Tubérculos, Lácteos, Plátanos):
 *   Volatilidad semanal. SLA: Vigente <= 8d, Por vencer 9-14d, Vencido > 14d.
 * - Clase C (No perecederos / Secos: Despensa, Abarrotes, Congelados, Procesados):
 *   Estabilidad mensual. SLA: Vigente <= 30d, Por vencer 31-45d, Vencido > 45d.
 */
export function getFreshnessSLA(category?: string | null): FreshnessSLA {
    const cat = (category || '').trim().toUpperCase();

    // Hiperperecederos (Clase A)
    if (['HO', 'VE', 'HI', 'HORTALIZA', 'VERDURA', 'HIERBA'].includes(cat)) {
        return {
            perishabilityClass: 'A',
            classLabel: 'Hiperperecedero (Clase A)',
            validDaysMax: 4,
            dueSoonDaysMax: 7,
            description: 'Volatilidad alta diaria/interdiaria en Corabastos. SLA máximo de 4 días.'
        };
    }

    // No perecederos / Abarrotes (Clase C)
    if (['DE', 'CO', 'PR', 'AB', 'DESPENSA', 'CONGELADO', 'PROCESADO', 'ABARROTES', 'SECOS'].includes(cat)) {
        return {
            perishabilityClass: 'C',
            classLabel: 'No Perecedero / Despensa (Clase C)',
            validDaysMax: 30,
            dueSoonDaysMax: 45,
            description: 'Precios estables por lista mensual. SLA de revisión hasta 30 días.'
        };
    }

    // Semi-perecederos (Clase B) - Default para Frutas, Tubérculos y otros
    return {
        perishabilityClass: 'B',
        classLabel: 'Semi-perecedero (Clase B)',
        validDaysMax: 8,
        dueSoonDaysMax: 14,
        description: 'Fluctuación semanal estándar de cosecha. SLA máximo de 8 a 14 días.'
    };
}

/**
 * Evalúa el ciclo de vida y vigencia operativa del costo de un producto
 */
export function evaluateCostFreshness(
    latestSignalDate: Date | string | null | undefined,
    category?: string | null,
    currentCost: number = 0,
    signalSource: 'COMPRAS' | 'MANUAL' | 'SIN_SEÑAL' = 'SIN_SEÑAL'
): ProductCostLifecycle {
    const sla = getFreshnessSLA(category);

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
            sla
        };
    }

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const daysOld = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const formattedDate = dateObj.toISOString().slice(0, 10);
    const sourceText = signalSource === 'COMPRAS' ? 'Orden Compra' : signalSource === 'MANUAL' ? 'Carga Masiva / Manual' : 'Registro BD';

    if (daysOld <= sla.validDaysMax) {
        return {
            daysOld,
            status: 'VIGENTE',
            statusLabel: `Vigente (${daysOld}d)`,
            statusColor: '#059669',
            statusBg: '#ECFDF5',
            sourceLabel: sourceText,
            signalDateFormatted: formattedDate,
            isExpired: false,
            isDueSoon: false,
            currentCost,
            sla
        };
    } else if (daysOld <= sla.dueSoonDaysMax) {
        return {
            daysOld,
            status: 'POR_VENCER',
            statusLabel: `Por Vencer (${daysOld}d)`,
            statusColor: '#D97706',
            statusBg: '#FFFBEB',
            sourceLabel: sourceText,
            signalDateFormatted: formattedDate,
            isExpired: false,
            isDueSoon: true,
            currentCost,
            sla
        };
    } else {
        return {
            daysOld,
            status: 'VENCIDO',
            statusLabel: `Vencido (${daysOld}d)`,
            statusColor: '#DC2626',
            statusBg: '#FEF2F2',
            sourceLabel: sourceText,
            signalDateFormatted: formattedDate,
            isExpired: true,
            isDueSoon: false,
            currentCost,
            sla
        };
    }
}
