import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    checkVolatilityCircuitBreaker,
    filterPriceOutliers,
    runAdaptivePricingModel,
    calculateAdaptiveCost,
    PriceObservation
} from '../../src/lib/commercial/adaptivePricingEngine';

import {
    getFreshnessSLA,
    computeProductTerciles,
    evaluateCostFreshness
} from '../../src/lib/commercial/costFreshnessPolicy';

// ============================================================================
// SUITE 1: MOTOR DE PRECIOS ADAPTATIVO (adaptivePricingEngine.ts)
// ============================================================================
describe('TDD: Motor de Precios Adaptativo (adaptivePricingEngine)', () => {

    describe('1. Regla Canónica del Último Hecho (Zero Artificial Smoothing)', () => {
        it('debe tomar como costo base el último precio cronológico registrado', () => {
            const observations: PriceObservation[] = [
                { price: 2500, date: '2026-09-01T10:00:00Z', quantity: 100 },
                { price: 3200, date: '2026-09-10T10:00:00Z', quantity: 80 },
                { price: 2900, date: '2026-09-15T10:00:00Z', quantity: 120 } // Más reciente
            ];

            const result = runAdaptivePricingModel(observations);

            assert.equal(result.grossCost, 2900, 'El costo base bruto debe ser exactamente el último precio registrado');
            assert.equal(result.latestValidPrice, 2900);
            assert.equal(result.alpha, 1.0, 'El modelo no debe aplicar atenuación ni medias móviles (alpha=1.0)');
            assert.equal(result.modelType, 'ADAPTIVE_ABASTOS');
        });

        it('debe retornar fallback cuando no hay observaciones válidas', () => {
            const result = runAdaptivePricingModel([], 3500);
            assert.equal(result.grossCost, 3500, 'Debe recurrir al precio de referencia');
            assert.equal(result.daysSinceLatest, 999);
        });
    });

    describe('2. Poka-Yoke / Circuit Breaker de Volatilidad (+/- > 20%)', () => {
        it('debe activar circuit breaker si el precio sube más del 20%', () => {
            // De 2000 a 2500 es +25%
            const cb = checkVolatilityCircuitBreaker(2500, 2000, 20);
            assert.equal(cb.isTriggered, true, 'Debe disparar alarma por subida brusca');
            assert.equal(cb.deltaPct, 25);
            assert.match(cb.message, /\+25%/);
        });

        it('debe activar circuit breaker si el precio cae más del 20%', () => {
            // De 2000 a 1400 es -30%
            const cb = checkVolatilityCircuitBreaker(1400, 2000, 20);
            assert.equal(cb.isTriggered, true, 'Debe disparar alarma por caída brusca');
            assert.equal(cb.deltaPct, -30);
            assert.match(cb.message, /-30%/);
        });

        it('no debe activar circuit breaker si la variación está dentro del rango normal (<= 20%)', () => {
            // De 2000 a 2200 es +10%
            const cb = checkVolatilityCircuitBreaker(2200, 2000, 20);
            assert.equal(cb.isTriggered, false, 'No debe disparar alarma dentro de rango');
            assert.equal(cb.deltaPct, 10);
        });

        it('debe manejar precios anteriores en 0 o inválidos sin romper el sistema', () => {
            const cb = checkVolatilityCircuitBreaker(2200, 0, 20);
            assert.equal(cb.isTriggered, false);
            assert.equal(cb.deltaPct, 0);
        });
    });

    describe('3. Factor de Merma Teórica (C_efectivo = C_base / (1 - Merma%))', () => {
        it('debe recargar el costo efectivo según el porcentaje de merma', () => {
            const observations: PriceObservation[] = [
                { price: 2700, date: '2026-09-18T10:00:00Z', quantity: 50 }
            ];

            // Con 10% de merma: 2700 / (1 - 0.10) = 2700 / 0.90 = 3000
            const result = runAdaptivePricingModel(observations, undefined, { shrinkagePct: 10 });
            assert.equal(result.grossCost, 2700, 'Costo base es 2700');
            assert.equal(result.cost, 3000, 'Costo efectivo con 10% merma debe ser 3000');
            assert.equal(result.shrinkageCostDelta, 300, 'El sobrecosto por merma debe ser 300');
        });

        it('debe mantener costo neto igual a bruto cuando shrinkagePct es 0', () => {
            const observations: PriceObservation[] = [
                { price: 2700, date: '2026-09-18T10:00:00Z' }
            ];
            const cost = calculateAdaptiveCost(observations, undefined, { shrinkagePct: 0 });
            assert.equal(cost, 2700);
        });
    });

    describe('4. Filtro de Outliers y Anomalías de Escala', () => {
        it('debe descartar observaciones con precios negativos o no numéricos', () => {
            const obs: PriceObservation[] = [
                { price: -500, date: '2026-09-01' },
                { price: 2500, date: '2026-09-02' },
                { price: NaN, date: '2026-09-03' }
            ];
            const { validObservations } = filterPriceOutliers(obs);
            assert.equal(validObservations.length, 1);
            assert.equal(validObservations[0].price, 2500);
        });

        it('debe filtrar valores aberrantes (ej. digitación de bulto vs kilo > 3.5x anchor)', () => {
            const obs: PriceObservation[] = [
                { price: 3000, date: '2026-09-01' },
                { price: 2800, date: '2026-09-02' },
                { price: 50000, date: '2026-09-03' } // Error de digitación: precio de bulto completo
            ];
            const { validObservations, outlierObservations, filteredCount } = filterPriceOutliers(obs, 3000);
            assert.equal(filteredCount, 1);
            assert.equal(outlierObservations[0].price, 50000);
            assert.ok(validObservations.every(o => o.price <= 3000 * 3.5));
        });
    });
});

// ============================================================================
// SUITE 2: POLÍTICA DE FRESCURA & SLAS DE COSTOS (costFreshnessPolicy.ts)
// ============================================================================
describe('TDD: Política de Frescura y Acuerdos de Nivel de Servicio (costFreshnessPolicy)', () => {

    describe('1. Matriz de SLA por Tercil de Pareto', () => {
        it('debe asignar SLA estricto de 4 días a Tercil 1 (T1: Alta Frecuencia / Crítico)', () => {
            const sla = getFreshnessSLA('T1');
            assert.equal(sla.validDaysMax, 4);
            assert.equal(sla.dueSoonDaysMax, 3);
            assert.equal(sla.tercil, 'T1');
        });

        it('debe asignar SLA moderado de 8 días a Tercil 2 (T2: Frecuencia Media)', () => {
            const sla = getFreshnessSLA('T2');
            assert.equal(sla.validDaysMax, 8);
            assert.equal(sla.dueSoonDaysMax, 6);
            assert.equal(sla.tercil, 'T2');
        });

        it('debe asignar SLA de 15 días a Tercil 3 (T3: Baja Frecuencia / Catálogo Extendido)', () => {
            const sla = getFreshnessSLA('T3');
            assert.equal(sla.validDaysMax, 15);
            assert.equal(sla.dueSoonDaysMax, 12);
            assert.equal(sla.tercil, 'T3');
        });

        it('debe soportar compatibilidad hacia atrás con categorías históricas', () => {
            const slaHortaliza = getFreshnessSLA('HORTALIZA');
            assert.equal(slaHortaliza.tercil, 'T1');

            const slaAbarrotes = getFreshnessSLA('ABARROTES');
            assert.equal(slaAbarrotes.tercil, 'T3');
        });
    });

    describe('2. Segmentación Dinámica de Terciles de Pareto', () => {
        it('debe dividir los productos equitativamente en 3 terciles según compras registradas', () => {
            const products = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
            const purchaseCounts = {
                p1: 100, p2: 90, p3: 80, // Top 3 -> T1
                p4: 50,  p5: 40, p6: 30, // Mid 3 -> T2
                p7: 10,  p8: 5,  p9: 1   // Low 3 -> T3
            };

            const terciles = computeProductTerciles(products, purchaseCounts);

            assert.equal(terciles['p1'], 'T1');
            assert.equal(terciles['p2'], 'T1');
            assert.equal(terciles['p3'], 'T1');

            assert.equal(terciles['p4'], 'T2');
            assert.equal(terciles['p5'], 'T2');
            assert.equal(terciles['p6'], 'T2');

            assert.equal(terciles['p7'], 'T3');
            assert.equal(terciles['p8'], 'T3');
            assert.equal(terciles['p9'], 'T3');
        });
    });

    describe('3. Evaluación del Ciclo de Vida del Costo (VIGENTE, POR_VENCER, VENCIDO)', () => {
        it('debe marcar costo como VIGENTE si la última señal está dentro del SLA', () => {
            // Hace 2 días para un producto T1 (SLA 4d)
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

            const result = evaluateCostFreshness(twoDaysAgo, 'T1', 3200, 'COMPRAS');
            assert.equal(result.status, 'VIGENTE');
            assert.equal(result.isExpired, false);
            assert.equal(result.isDueSoon, false);
        });

        it('debe marcar costo como POR_VENCER si entra en ventana de alerta', () => {
            // Hace 3 días para un producto T1 (SLA 4d, alerta en 3d)
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const result = evaluateCostFreshness(threeDaysAgo, 'T1', 3200, 'COMPRAS');
            assert.equal(result.status, 'POR_VENCER');
            assert.equal(result.isExpired, false);
            assert.equal(result.isDueSoon, true);
        });

        it('debe marcar costo como VENCIDO si supera los días máximos de validez', () => {
            // Hace 6 días para un producto T1 (SLA 4d)
            const sixDaysAgo = new Date();
            sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

            const result = evaluateCostFreshness(sixDaysAgo, 'T1', 3200, 'COMPRAS');
            assert.equal(result.status, 'VENCIDO');
            assert.equal(result.isExpired, true);
            assert.equal(result.isDueSoon, false);
        });

        it('debe marcar costo como SIN_REFERENCIA si fecha es nula o costo <= 0', () => {
            const noDate = evaluateCostFreshness(null, 'T1', 3200);
            assert.equal(noDate.status, 'SIN_REFERENCIA');
            assert.equal(noDate.isExpired, true);

            const zeroCost = evaluateCostFreshness(new Date(), 'T1', 0);
            assert.equal(zeroCost.status, 'SIN_REFERENCIA');
            assert.equal(zeroCost.isExpired, true);
        });
    });
});

// ============================================================================
// SUITE 3: CONTRATO DE NEGOCIACIÓN Y CONTRAOFERTAS (Reglas B2B)
// ============================================================================
describe('TDD: Contrato de Negociación y Márgenes B2B', () => {
    it('debe calcular el margen real exacto y clasificar contraofertas', () => {
        // Regla: Margen % = ((Precio Ofertado - Costo Base) / Precio Ofertado) * 100
        const items = [
            { name: 'Tomate Chonto', proposedPrice: 3200, costBasis: 2500 }, // Margen: 21.87% -> Aceptado
            { name: 'Papa Pastusa', proposedPrice: 2000, costBasis: 2500 }   // Margen: -25% -> Contraoferta requerida
        ];

        const evaluated = items.map(item => {
            const marginPct = Math.round(((item.proposedPrice - item.costBasis) / item.proposedPrice) * 100);
            const requiresCounterOffer = marginPct < 15;
            const counterPrice = requiresCounterOffer ? Math.round(item.costBasis * 1.25) : item.proposedPrice;

            return {
                ...item,
                marginPct,
                requiresCounterOffer,
                counterPrice
            };
        });

        assert.equal(evaluated[0].marginPct, 22);
        assert.equal(evaluated[0].requiresCounterOffer, false);
        assert.equal(evaluated[0].counterPrice, 3200);

        assert.equal(evaluated[1].marginPct, -25);
        assert.equal(evaluated[1].requiresCounterOffer, true);
        assert.equal(evaluated[1].counterPrice, 3125, 'Contraoferta debe apuntar al 25% de markup sobre costo base');
    });
});
