/**
 * holtWintersEngine.ts
 * Capa de compatibilidad retroactiva hacia adaptivePricingEngine.ts
 * FruFresco - Módulo Comercial & Abastecimiento
 */

import {
    runAdaptivePricingModel,
    calculateAdaptiveCost,
    filterPriceOutliers as adaptiveFilterPriceOutliers,
    PriceObservation as AdaptivePriceObservation,
    AdaptivePricingResult,
    AdaptivePricingOptions
} from './adaptivePricingEngine';

export type PriceObservation = AdaptivePriceObservation;

export interface HoltWintersResult {
    cost: number;
    level: number;
    trend: number;
    alpha: number;
    beta: number;
    outliersFilteredCount: number;
    latestValidPrice: number;
    daysSinceLatest: number;
    isClamped: boolean;
}

export const filterPriceOutliers = adaptiveFilterPriceOutliers;

/**
 * Ejecuta el modelo adaptativo sobre las observaciones de precio.
 * Compatible con la interfaz previa de Holt-Winters pero utilizando el
 * nuevo motor adaptativo con amortiguación de Corabastos y contención acotada.
 */
export function runHoltWintersModel(
    rawObservations: PriceObservation[],
    referencePrice?: number,
    options?: AdaptivePricingOptions
): HoltWintersResult {
    const res = runAdaptivePricingModel(rawObservations, referencePrice, options);
    return {
        cost: res.cost,
        level: res.level,
        trend: res.trend,
        alpha: res.alpha,
        beta: 0.2,
        outliersFilteredCount: res.outliersFilteredCount,
        latestValidPrice: res.latestValidPrice,
        daysSinceLatest: res.daysSinceLatest,
        isClamped: res.isClamped
    };
}

export function calculateHoltWintersCost(
    rawObservations: PriceObservation[],
    referencePrice?: number,
    options?: AdaptivePricingOptions
): number {
    return calculateAdaptiveCost(rawObservations, referencePrice, options);
}
