/**
 * adaptivePricingEngine.ts
 * Motor de Precios FruFresco (SPEC v1.7.0)
 * 
 * Principio Canónico:
 * 1. Regla del Último Hecho: El costo base es el ÚLTIMO PRECIO REAL registrado (en Compras o Manual).
 * 2. Cero Alisamiento Ficticio: Erradicación de medias móviles y Holt-Winters para Corabastos.
 * 3. Circuit Breaker de Volatilidad (+/- > 20%): Alerta y congelamiento preventivo del precio previo.
 * 4. Factor de Merma Teórica: C_efectivo = C_base / (1 - Merma%)
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
    defaultSondeoWeight?: number;
    perishabilityClass?: 'A' | 'B' | 'C';
}

export interface CircuitBreakerResult {
    isTriggered: boolean;
    deltaPct: number;
    previousPrice: number;
    newPrice: number;
    message: string;
}

export interface AdaptivePricingResult {
    cost: number;                    // Costo neto final aprovechable (con merma si aplica)
    grossCost: number;               // Costo base del último hecho
    level: number;                   // Equivalente a grossCost
    trend: number;                   // Tendencia absoluta en $/Kg vs compra anterior
    trendPct: number;                // Tendencia porcentual de la compra anterior
    trendDirection: 'up' | 'down' | 'stable';
    shrinkagePct: number;            // % de merma aplicada
    shrinkageCostDelta: number;      // Sobrecosto en pesos por kilo por concepto de merma
    alpha: number;                   // 1.0 (Sin atenuación)
    outliersFilteredCount: number;
    latestValidPrice: number;
    daysSinceLatest: number;
    totalVolumeKg: number;
    isClamped: boolean;
    modelType: 'ADAPTIVE_ABASTOS';
    circuitBreaker?: CircuitBreakerResult;
}

/**
 * Evalúa el Poka-Yoke / Circuit Breaker ante una nueva variación de precio (+/- > 20%)
 */
export function checkVolatilityCircuitBreaker(
    newPrice: number,
    previousPrice: number,
    thresholdPct: number = 20
): CircuitBreakerResult {
    if (!previousPrice || previousPrice <= 0 || !newPrice || newPrice <= 0) {
        return {
            isTriggered: false,
            deltaPct: 0,
            previousPrice: previousPrice || 0,
            newPrice: newPrice || 0,
            message: 'Sin comparación previa'
        };
    }

    const delta = newPrice - previousPrice;
    const deltaPct = Math.round((delta / previousPrice) * 100);
    const isTriggered = Math.abs(deltaPct) > thresholdPct;

    return {
        isTriggered,
        deltaPct,
        previousPrice,
        newPrice,
        message: isTriggered 
            ? `Variación de ${deltaPct > 0 ? '+' : ''}${deltaPct}% excede el límite del ${thresholdPct}%` 
            : 'Variación dentro de rango normal'
    };
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
    const anchor = (referencePrice && referencePrice > 0) ? referencePrice : sortedDesc[0].price;

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
 * Ejecuta la regla canónica del Último Precio Real (FruFresco SPEC v1.7.0)
 */
export function runAdaptivePricingModel(
    rawObservations: PriceObservation[],
    referencePrice?: number,
    options?: AdaptivePricingOptions
): AdaptivePricingResult {
    const shrinkagePct = Math.max(0, Math.min(45, options?.shrinkagePct || 0));
    const { validObservations, filteredCount } = filterPriceOutliers(rawObservations, referencePrice);

    // Caso 0: Sin observaciones válidas
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
            alpha: 1.0,
            outliersFilteredCount: filteredCount,
            latestValidPrice: fallback,
            daysSinceLatest: 999,
            totalVolumeKg: 0,
            isClamped: false,
            modelType: 'ADAPTIVE_ABASTOS'
        };
    }

    // Ordenar cronológicamente (más antiguo -> más reciente)
    const sorted = [...validObservations].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
    });

    const latestObs = sorted[sorted.length - 1];
    const latestPrice = Math.round(latestObs.price);
    const latestDate = new Date(latestObs.date);
    const now = new Date();
    const daysSinceLatest = isNaN(latestDate.getTime()) 
        ? 0 
        : Math.max(0, Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Último precio real es la base directa (Cero alisamiento artificial)
    const grossCost = latestPrice;

    // Aplicar factor de merma teórica: C_efectivo = C_base / (1 - Merma%)
    let netCost = grossCost;
    let shrinkageCostDelta = 0;
    if (shrinkagePct > 0) {
        netCost = Math.round(grossCost / (1 - (shrinkagePct / 100)));
        shrinkageCostDelta = netCost - grossCost;
    }

    // Calcular tendencia respecto al precio anterior
    let trendDelta = 0;
    let trendPct = 0;
    let trendDirection: 'up' | 'down' | 'stable' = 'stable';
    let circuitBreaker: CircuitBreakerResult | undefined;

    if (sorted.length >= 2) {
        const prevObs = sorted[sorted.length - 2];
        trendDelta = latestPrice - Math.round(prevObs.price);
        trendPct = Math.round((trendDelta / (prevObs.price || 1)) * 100);
        trendDirection = trendPct > 3 ? 'up' : trendPct < -3 ? 'down' : 'stable';
        circuitBreaker = checkVolatilityCircuitBreaker(latestPrice, Math.round(prevObs.price), 20);
    } else if (referencePrice && referencePrice > 0 && referencePrice !== latestPrice) {
        trendDelta = latestPrice - referencePrice;
        trendPct = Math.round((trendDelta / referencePrice) * 100);
        trendDirection = trendPct > 3 ? 'up' : trendPct < -3 ? 'down' : 'stable';
        circuitBreaker = checkVolatilityCircuitBreaker(latestPrice, referencePrice, 20);
    }

    const totalVolume = sorted.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

    return {
        cost: netCost,
        grossCost,
        level: grossCost,
        trend: trendDelta,
        trendPct,
        trendDirection,
        shrinkagePct,
        shrinkageCostDelta,
        alpha: 1.0,
        outliersFilteredCount: filteredCount,
        latestValidPrice: latestPrice,
        daysSinceLatest,
        totalVolumeKg: Math.round(totalVolume),
        isClamped: false,
        modelType: 'ADAPTIVE_ABASTOS',
        circuitBreaker
    };
}

/**
 * Función canónica para obtener directamente el costo calculado por Kg
 */
export function calculateAdaptiveCost(
    rawObservations: PriceObservation[],
    referencePrice?: number,
    options?: AdaptivePricingOptions
): number {
    return runAdaptivePricingModel(rawObservations, referencePrice, options).cost;
}

