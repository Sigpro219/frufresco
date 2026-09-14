/**
 * adaptivePricingEngine.ts
 * Motor de Alisamiento Adaptativo FruFresco para Mercados Agrícolas y Corabastos
 * Incorpora:
 * 1. Ponderación por Volumen (VWAP) para compras reales (/ops/compras) y peso referencial para sondeos.
 * 2. Amortiguador Asimétrico de Choque:
 *    - Amortigua picos transitorios de un solo día (protege al cliente de la volatilidad errática).
 *    - Acelera la captación ante escasez estacional confirmada (protege el margen de la compañía).
 *    - Desescalamiento suave ante desplomes de mercado para permitir la rotación de inventario en bodega.
 * 3. Factor de Merma Operativa (Cols P, Q, R del balance diario): ajusta a costo neto por kilo aprovechable.
 * 4. Regla de Oro Inquebrantable: el costo base bruto NUNCA excede el precio más alto observado ni perfora el más bajo.
 */

export interface PriceObservation {
    price: number;
    date: Date | string;
    quantity?: number | null;        // Volumen en Kilos (si es compra física real)
    source?: string;                 // 'COMPRAS' | 'COTIZACION' | 'SONDEO' | 'MANUAL'
    purchaseUnit?: string | null;
}

export interface AdaptivePricingOptions {
    shrinkagePct?: number;           // % de merma técnica/real (ej: 7.5 para 7.5%)
    defaultSondeoWeight?: number;    // Peso en Kilos asignado a cotizaciones sin volumen (default: 15 Kg)
    perishabilityClass?: 'A' | 'B' | 'C'; // Clase A (Hiperperecedero), B (Semi), C (Seco)
}

export interface AdaptivePricingResult {
    cost: number;                    // Costo neto final aprovechable (con merma si aplica)
    grossCost: number;               // Costo base alisado antes de merma (garantizado dentro de min-max)
    level: number;                   // Nivel alisado adaptativo (equivalente a grossCost)
    trend: number;                   // Tendencia absoluta en $/Kg
    trendPct: number;                // Tendencia porcentual de la serie (+16%, -8%, etc.)
    trendDirection: 'up' | 'down' | 'stable';
    shrinkagePct: number;            // % de merma aplicada
    shrinkageCostDelta: number;      // Sobrecosto en pesos por kilo por concepto de merma
    alpha: number;                   // Coeficiente de adaptación efectivo aplicado
    outliersFilteredCount: number;
    latestValidPrice: number;
    daysSinceLatest: number;
    totalVolumeKg: number;
    isClamped: boolean;
    modelType: 'ADAPTIVE_ABASTOS';
}

/**
 * Calcula la mediana de un conjunto de precios
 */
function calculateMedian(prices: number[]): number {
    if (prices.length === 0) return 0;
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Filtro de Outliers y Anomalías de Escala (empaques no unitarios, bultos o errores de digitación)
 */
export function filterPriceOutliers(
    observations: PriceObservation[],
    referencePrice?: number
): {
    validObservations: PriceObservation[];
    outlierObservations: PriceObservation[];
    filteredCount: number;
} {
    const positiveObs = observations.filter(o => typeof o.price === 'number' && !isNaN(o.price) && o.price > 0);
    if (positiveObs.length <= 1) {
        return { validObservations: positiveObs, outlierObservations: [], filteredCount: 0 };
    }

    const sortedDesc = [...positiveObs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const anchor = (referencePrice && referencePrice > 0) ? referencePrice : (sortedDesc[0]?.price || calculateMedian(positiveObs.map(o => o.price)));

    const upperLimit = anchor * 3.5;
    const lowerLimit = Math.max(50, anchor * 0.25);

    const validObservations: PriceObservation[] = [];
    const outlierObservations: PriceObservation[] = [];

    positiveObs.forEach(o => {
        if (o.price >= lowerLimit && o.price <= upperLimit) {
            validObservations.push(o);
        } else {
            outlierObservations.push(o);
        }
    });

    if (validObservations.length === 0 && sortedDesc.length > 0) {
        return {
            validObservations: [sortedDesc[0]],
            outlierObservations: sortedDesc.slice(1),
            filteredCount: positiveObs.length - 1
        };
    }

    return {
        validObservations,
        outlierObservations,
        filteredCount: outlierObservations.length
    };
}

/**
 * Ejecuta el Motor de Alisamiento Adaptativo FruFresco sobre el historial de observaciones
 */
export function runAdaptivePricingModel(
    rawObservations: PriceObservation[],
    referencePrice?: number,
    options?: AdaptivePricingOptions
): AdaptivePricingResult {
    const defaultSondeoWeight = options?.defaultSondeoWeight || 15;
    const shrinkagePct = Math.max(0, Math.min(45, options?.shrinkagePct || 0));

    const { validObservations, filteredCount } = filterPriceOutliers(rawObservations, referencePrice);

    // Caso 0: Sin observaciones
    if (validObservations.length === 0) {
        const fallback = referencePrice && referencePrice > 0 ? Math.round(referencePrice) : 0;
        const netCost = shrinkagePct > 0 ? Math.round(fallback / (1 - shrinkagePct / 100)) : fallback;
        return {
            cost: netCost,
            grossCost: fallback,
            level: fallback,
            trend: 0,
            trendPct: 0,
            trendDirection: 'stable',
            shrinkagePct,
            shrinkageCostDelta: netCost - fallback,
            alpha: 0.5,
            outliersFilteredCount: filteredCount,
            latestValidPrice: fallback,
            daysSinceLatest: 999,
            totalVolumeKg: 0,
            isClamped: false,
            modelType: 'ADAPTIVE_ABASTOS'
        };
    }

    // Ordenar cronológicamente (antiguo -> más reciente)
    const sorted = [...validObservations].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
    });

    const latestObs = sorted[sorted.length - 1];
    const latestPrice = latestObs.price;
    const latestDate = new Date(latestObs.date);
    const now = new Date();
    const daysSinceLatest = isNaN(latestDate.getTime()) 
        ? 0 
        : Math.max(0, Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Caso 1: Una sola observación
    if (sorted.length === 1) {
        const base = Math.round(latestPrice);
        const netCost = shrinkagePct > 0 ? Math.round(base / (1 - shrinkagePct / 100)) : base;
        const vol = (latestObs.quantity && latestObs.quantity > 0) ? latestObs.quantity : defaultSondeoWeight;
        return {
            cost: netCost,
            grossCost: base,
            level: base,
            trend: 0,
            trendPct: 0,
            trendDirection: 'stable',
            shrinkagePct,
            shrinkageCostDelta: netCost - base,
            alpha: 1.0,
            outliersFilteredCount: filteredCount,
            latestValidPrice: base,
            daysSinceLatest,
            totalVolumeKg: vol,
            isClamped: false,
            modelType: 'ADAPTIVE_ABASTOS'
        };
    }

    // --- ANÁLISIS DE DINÁMICA DE MERCADO (RACHAS Y CHOQUES) ---
    let upwardStreak = 0;
    let downwardStreak = 0;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].price > sorted[i - 1].price) {
            upwardStreak++;
            downwardStreak = 0;
        } else if (sorted[i].price < sorted[i - 1].price) {
            downwardStreak++;
            upwardStreak = 0;
        }
    }

    const prevObs = sorted[sorted.length - 2];
    const priceShock = (latestPrice - prevObs.price) / (prevObs.price || 1);
    const absShock = Math.abs(priceShock);

    // --- FACTOR DE ALISAMIENTO ADAPTATIVO (ALFA ASIMÉTRICO) ---
    let alpha = 0.55; // Base de equilibrio para frutas y hortalizas

    // Modulación por frescura del dato
    if (daysSinceLatest > 7) {
        // La señal está vieja: decaer peso para apoyarse en la estabilidad del inventario
        alpha = Math.max(0.20, 0.55 * Math.exp(-0.05 * (daysSinceLatest - 7)));
    } else {
        // Señal fresca de plaza
        if (priceShock > 0.18 && upwardStreak <= 1) {
            // Salto brusco hacia arriba de un solo día (pico transitorio de plaza):
            // Amortiguamos para NO espantar clientes con subidas histéricas
            alpha = 0.35;
        } else if (upwardStreak >= 2) {
            // Tendencia alcista confirmada (2 o más observaciones consecutivas al alza = escasez real):
            // Aceleramos la absorción para NO perder pesos contra el nuevo piso de mercado
            alpha = 0.78;
        } else if (priceShock < -0.15) {
            // Desplome repentino del precio de mercado:
            // Caída amortiguada para dar tiempo a la bodega de rotar el inventario caro previo
            alpha = 0.40;
        } else if (absShock <= 0.08) {
            // Mercado estable: convergencia suave
            alpha = 0.60;
        }
    }

    // --- PONDERACIÓN POR VOLUMEN (VWAP) Y ALISAMIENTO SECUENCIAL ---
    // Cada paso pondera la masa de inventario (Kilos) con el factor de recencia adaptativo
    let smoothedPrice = sorted[0].price;
    let totalVolume = (sorted[0].quantity && sorted[0].quantity > 0) ? sorted[0].quantity : defaultSondeoWeight;

    for (let i = 1; i < sorted.length; i++) {
        const obs = sorted[i];
        const obsPrice = obs.price;
        const obsVolume = (obs.quantity && obs.quantity > 0) ? obs.quantity : defaultSondeoWeight;

        totalVolume += obsVolume;

        // Ratio de volumen relativo: compras grandes (> promedio) tienen mayor inercia
        const volumeWeightRatio = Math.min(1.5, Math.max(0.6, obsVolume / (totalVolume / (i + 1))));
        const effectiveAlpha = Math.min(0.90, Math.max(0.15, alpha * volumeWeightRatio));

        smoothedPrice = (effectiveAlpha * obsPrice) + ((1 - effectiveAlpha) * smoothedPrice);
    }

    // --- REGLA INFRANQUEABLE DE CONTENCIÓN (BOUNDED CONVEX HULL) ---
    // El costo bruto JAMÁS puede superar el precio máximo ni ser menor al mínimo de las observaciones reales
    const allPrices = sorted.map(o => o.price);
    const minObserved = Math.min(...allPrices);
    const maxObserved = Math.max(...allPrices);

    let grossCost = Math.round(smoothedPrice);
    let isClamped = false;

    if (grossCost > maxObserved) {
        grossCost = maxObserved;
        isClamped = true;
    } else if (grossCost < minObserved) {
        grossCost = minObserved;
        isClamped = true;
    }

    // --- APLICACIÓN DEL FACTOR DE MERMA OPERATIVA (COLS P, Q, R) ---
    // Costo Neto Aprovechable = Costo Bruto / (1 - %Merma)
    let netCost = grossCost;
    let shrinkageCostDelta = 0;
    if (shrinkagePct > 0) {
        netCost = Math.round(grossCost / (1 - (shrinkagePct / 100)));
        shrinkageCostDelta = netCost - grossCost;
    }

    // --- MÉTRICAS DE TENDENCIA (PARA SPARKLINES Y BADGES) ---
    const trendDelta = latestPrice - prevObs.price;
    const trendPct = Math.round(((latestPrice - prevObs.price) / (prevObs.price || 1)) * 100);
    const trendDirection: 'up' | 'down' | 'stable' = 
        trendPct > 3 ? 'up' : trendPct < -3 ? 'down' : 'stable';

    return {
        cost: netCost,
        grossCost,
        level: grossCost,
        trend: trendDelta,
        trendPct,
        trendDirection,
        shrinkagePct,
        shrinkageCostDelta,
        alpha: Math.round(alpha * 100) / 100,
        outliersFilteredCount: filteredCount,
        latestValidPrice: Math.round(latestPrice),
        daysSinceLatest,
        totalVolumeKg: Math.round(totalVolume),
        isClamped,
        modelType: 'ADAPTIVE_ABASTOS'
    };
}

/**
 * Función de utilidad simplificada para obtener directamente el costo calculado por Kg
 */
export function calculateAdaptiveCost(
    rawObservations: PriceObservation[],
    referencePrice?: number,
    options?: AdaptivePricingOptions
): number {
    return runAdaptivePricingModel(rawObservations, referencePrice, options).cost;
}
