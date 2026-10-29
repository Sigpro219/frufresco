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

import { fetchAllRows } from '../../src/lib/supabase';
import {
    parseBlindCountQuantity,
    resolveLatestProductCost,
    applyProductUnitConversion,
    DEFAULT_INSTITUTIONAL_MARGIN_PCT,
    GENERAL_INSTITUCIONAL_ID,
    FAMILIA_CORTES_CORPORATIVO_ID
} from '../../src/lib/pricingUtils';

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

// ============================================================================
// SUITE 4: ESCENARIO 338 (SDD v1.9.321) — DT-01 & DT-04
// ============================================================================
describe('TDD: Escenario 338 — DT-01 (Piso 25% & Blindaje 0% Corporativo) y DT-04 (parseBlindCountQuantity)', () => {
    it('debe extraer counted_quantity desde [BLIND_COUNT_META] incluso con llaves anidadas en strings', () => {
        const notes = 'Cruce a ciegas fin de turno | Célula: Célula {A} | Operador: Op | Stock anterior: 12.5 -> Contado: 12.5 (Dif: 0.00) [BLIND_COUNT_META: {"counted_quantity":12.5,"previous_quantity":12.5,"diff_quantity":0,"cell_name":"Célula {A}","operator":"Op"}]';
        assert.equal(parseBlindCountQuantity(notes), 12.5);
    });

    it('debe preservar exactamente counted_quantity = 0 cuando el conteo físico en bodega es cero', () => {
        const notes = 'Cruce a ciegas fin de turno | Stock anterior: 5 -> Contado: 0 (Dif: -5.00) [BLIND_COUNT_META: {"counted_quantity":0,"previous_quantity":5,"diff_quantity":-5,"cell_name":"Frutas","operator":"Op"}]';
        assert.equal(parseBlindCountQuantity(notes), 0);
    });

    it('debe aplicar fallback determinista al regex histórico /Contado:\\s*([0-9.,]+)/i si no existe bloque JSON', () => {
        const legacyNotes = 'Cruce a ciegas fin de turno | Célula: Verduras | Operador: Juan | Stock anterior: 10 -> Contado: 18,75 (Dif: +8.75)';
        assert.equal(parseBlindCountQuantity(legacyNotes), 18.75);
        assert.equal(parseBlindCountQuantity(null), null);
        assert.equal(parseBlindCountQuantity('Nota de movimiento sin conteo'), null);
    });

    it('debe verificar las constantes canónicas de piso institucional (25%) y Familia Cortés (0%)', () => {
        assert.equal(DEFAULT_INSTITUTIONAL_MARGIN_PCT, 25);
        assert.equal(GENERAL_INSTITUCIONAL_ID, 'd90a91e5-827c-473d-9d4f-3e28c7c91e15');
        assert.equal(FAMILIA_CORTES_CORPORATIVO_ID, '31c6d356-2d52-488f-81d6-abffaed295cf');
    });
});

// ============================================================================
// SUITE 5: ESCENARIO 339 (SDD v1.9.322) — DT-02 (fetchAllRows Paginación Transparente)
// ============================================================================
describe('TDD: Escenario 339 — DT-02 (Paginación Transparente fetchAllRows)', () => {
    it('debe ejecutar una sola consulta cuando el dataset tiene menos de 1000 filas', async () => {
        let calls = 0;
        const mockRows = Array.from({ length: 42 }, (_, i) => ({ id: `row-${i}` }));
        const { data, error } = await fetchAllRows(
            async (from, to) => {
                calls++;
                return { data: mockRows.slice(from, to + 1), error: null };
            },
            1000,
            10000
        );
        assert.equal(error, null);
        assert.equal(data.length, 42);
        assert.equal(calls, 1, 'Dataset pequeño debe resolverse en una sola llamada');
    });

    it('debe iterar sobre múltiples rangos cuando el dataset supera 1000 filas sin truncar', async () => {
        let calls = 0;
        const totalSimulated = 2500;
        const mockRows = Array.from({ length: totalSimulated }, (_, i) => ({ id: `row-${i}` }));
        const { data, error } = await fetchAllRows(
            async (from, to) => {
                calls++;
                return { data: mockRows.slice(from, to + 1), error: null };
            },
            1000,
            10000
        );
        assert.equal(error, null);
        assert.equal(data.length, totalSimulated);
        assert.equal(calls, 3, '2500 filas con pageSize 1000 requiere 3 llamadas (0-999, 1000-1999, 2000-2999)');
    });
});


// ============================================================================
// SUITE 6: ESCENARIO 343 (SDD v1.9.326) — Regla del "ÚLTIMO" Precio Vigente y Erradicación de Históricos
// ============================================================================
describe('TDD: Escenario 343 — Resolución Canónica del ÚLTIMO Precio Vigente (resolveLatestProductCost)', () => {
    it('debe priorizar commercial_cost_matrix ($8.450 sep 17) sobre compras históricas superadas ($140.000 mar 12)', () => {
        const ccmHabichuela = {
            cost: 8450,
            updatedAt: new Date('2026-09-17T16:06:27Z').getTime(),
            updatedBy: 'EXCEL-IMPORT'
        };
        const purHabichuelaHistorica = {
            cost: 140000,
            createdAt: new Date('2026-03-12T00:00:00Z').getTime(),
            createdAtIso: '2026-03-12T00:00:00Z'
        };

        const resolved = resolveLatestProductCost(ccmHabichuela, purHabichuelaHistorica);
        assert.equal(resolved.cost, 8450, 'Debe tomar el ÚLTIMO precio ($8.450) e ignorar el histórico de prueba ($140.000)');
        assert.equal(resolved.isPurchaseNewer, false);
    });

    it('debe congelar el costo de commercial_cost_matrix si una compra posterior salta > 20% (Circuit Breaker)', () => {
        const ccm = {
            cost: 10000,
            updatedAt: new Date('2026-09-17T10:00:00Z').getTime(),
            updatedBy: 'EXCEL-IMPORT'
        };
        const purSpike = {
            cost: 50000, // +400%
            createdAt: new Date('2026-09-20T10:00:00Z').getTime()
        };

        const resolved = resolveLatestProductCost(ccm, purSpike);
        assert.equal(resolved.cost, 10000, 'Circuit Breaker debe congelar el costo vigente ante salto >20% no aprobado');
        assert.equal(resolved.isPurchaseNewer, false);
    });

    it('debe adoptar una compra posterior cuando la variación es <= 20%', () => {
        const ccm = {
            cost: 10000,
            updatedAt: new Date('2026-09-17T10:00:00Z').getTime(),
            updatedBy: 'EXCEL-IMPORT'
        };
        const purValid = {
            cost: 11500, // +15%
            createdAt: new Date('2026-09-20T10:00:00Z').getTime(),
            createdAtIso: '2026-09-20T10:00:00Z'
        };

        const resolved = resolveLatestProductCost(ccm, purValid);
        assert.equal(resolved.cost, 11500);
        assert.equal(resolved.isPurchaseNewer, true);
    });

    it('debe aplicar conversión de unidad correctamente cuando existe factor en product_conversions', () => {
        const conversions = [
            { product_id: 'prod-1', from_unit: 'Bulto', to_unit: 'Kg', conversion_factor: 50 }
        ];
        assert.equal(applyProductUnitConversion(150000, 'prod-1', 'Bulto', 'Kg', conversions), 3000);
        assert.equal(applyProductUnitConversion(8450, 'prod-1', 'Kg', 'Kg', conversions), 8450);
    });
});
