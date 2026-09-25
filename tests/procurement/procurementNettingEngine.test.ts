import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    getCanonicalProcurementSpec,
    normalizeDemandToKg,
    resolvePurchaseUnit,
    calculateProcurementNetting,
    NettingOrderItem
} from '../../src/lib/procurement/procurementNettingEngine';

describe('Procurement Netting Engine (Cross-Docking / JIT)', () => {

    describe('resolvePurchaseUnit (Unidad Maestra de Compra del Catálogo)', () => {
        it('resuelve canónicamente todas las unidades maestras de Corabastos', () => {
            assert.strictEqual(resolvePurchaseUnit('Kg'), 'KG');
            assert.strictEqual(resolvePurchaseUnit('kilogramo'), 'KG');
            assert.strictEqual(resolvePurchaseUnit('Unidad'), 'UN');
            assert.strictEqual(resolvePurchaseUnit('und'), 'UN');
            assert.strictEqual(resolvePurchaseUnit('Atado'), 'ATADO');
            assert.strictEqual(resolvePurchaseUnit('Bandeja'), 'BANDEJA');
            assert.strictEqual(resolvePurchaseUnit('Bolsa'), 'BOLSA');
            assert.strictEqual(resolvePurchaseUnit('Bulto'), 'BULTO');
            assert.strictEqual(resolvePurchaseUnit('Caja'), 'CJ');
            assert.strictEqual(resolvePurchaseUnit('Cubeta'), 'CUBETA');
            assert.strictEqual(resolvePurchaseUnit('Docena'), 'DOC');
            assert.strictEqual(resolvePurchaseUnit('Paquete 500 gramos'), 'PQ 500G');
            assert.strictEqual(resolvePurchaseUnit('Paquete 250 gramos'), 'PQ 250G');
            assert.strictEqual(resolvePurchaseUnit('Libra'), 'LB');
            assert.strictEqual(resolvePurchaseUnit(null, 'und'), 'UN');
            assert.strictEqual(resolvePurchaseUnit(null, null), 'KG');
        });
    });

    describe('getCanonicalProcurementSpec (Unificación de Características)', () => {
        it('debe producir la misma especificación canónica independientemente de la cantidad solicitada por cada cliente', () => {
            // Cliente A pide 10 und de 160 gr (Pintón)
            const itemA = {
                product_name: 'Banano criollo',
                selected_options: {
                    _original_qty: 10,
                    _unit_weight_gr: 160,
                    'Maduración': 'Pintón'
                }
            };

            // Cliente B pide 5 und de 160 gr (Pintón)
            const itemB = {
                product_name: 'Banano criollo',
                selected_options: {
                    _original_qty: 5,
                    _unit_weight_gr: 160,
                    'Maduración': 'Pintón'
                }
            };

            const specA = getCanonicalProcurementSpec(itemA);
            const specB = getCanonicalProcurementSpec(itemB);

            assert.strictEqual(specA, 'und de 160 gr; Pintón');
            assert.strictEqual(specB, 'und de 160 gr; Pintón');
            assert.strictEqual(specA, specB, 'Ambos pedidos deben compartir la misma clave canónica');
        });

        it('debe eliminar atributos redundantes con el nombre del producto (ej: Maduro en Plátano maduro)', () => {
            const item = {
                product_name: 'Plátano maduro',
                selected_options: {
                    'Maduración': 'Maduro'
                }
            };

            const spec = getCanonicalProcurementSpec(item);
            assert.strictEqual(spec, '', 'No debe generar variante artificial por atributos redundantes');
        });

        it('debe descartar fallbacks de texto libre informal (variant_label: bananos, 1000 gr) y devolver vacío', () => {
            const item = {
                product_name: 'Banano criollo',
                variant_label: 'bananos',
                selected_options: null
            };

            const spec = getCanonicalProcurementSpec(item);
            assert.strictEqual(spec, '', 'El texto libre informal no debe inventar variantes');
        });

        it('debe conservar variantes reales diferenciales (Maduro vs Pintón)', () => {
            const itemMaduro = {
                product_name: 'Papaya maradol',
                selected_options: {
                    _unit_weight_gr: 2000,
                    'Maduración': 'Maduro'
                }
            };
            const itemPinton = {
                product_name: 'Papaya maradol',
                selected_options: {
                    _unit_weight_gr: 2000,
                    'Maduración': 'Pintón'
                }
            };

            assert.strictEqual(getCanonicalProcurementSpec(itemMaduro), 'und de 2 kg; Maduro');
            assert.strictEqual(getCanonicalProcurementSpec(itemPinton), 'und de 2 kg; Pintón');
        });
    });

    describe('normalizeDemandToKg (Normalización de Masa)', () => {
        it('normaliza correctamente cantidades de unidades con peso en gramos a Kg', () => {
            const res = normalizeDemandToKg({
                quantity: 10,
                rawUnit: 'und',
                selectedOptions: {
                    _original_qty: 10,
                    _unit_weight_gr: 160
                }
            });

            assert.strictEqual(res.effectiveQty, 1.6);
            assert.strictEqual(res.unitStr, 'KG');
        });

        it('respeta unidades discretas maestras (UN, CJ, DOC, ATADO, PQ)', () => {
            const resUN = normalizeDemandToKg({
                quantity: 12,
                rawUnit: 'und',
                productUom: 'Unidad'
            });
            assert.strictEqual(resUN.effectiveQty, 12);
            assert.strictEqual(resUN.unitStr, 'UN');

            const resCJ = normalizeDemandToKg({
                quantity: 3,
                rawUnit: 'caja',
                productUom: 'Caja'
            });
            assert.strictEqual(resCJ.effectiveQty, 3);
            assert.strictEqual(resCJ.unitStr, 'CJ');

            const resAtado = normalizeDemandToKg({
                quantity: 5,
                rawUnit: 'atado',
                productUom: 'Atado'
            });
            assert.strictEqual(resAtado.effectiveQty, 5);
            assert.strictEqual(resAtado.unitStr, 'ATADO');

            const resPQ = normalizeDemandToKg({
                quantity: 8,
                rawUnit: 'und',
                productUom: 'Paquete 500 gramos'
            });
            assert.strictEqual(resPQ.effectiveQty, 8);
            assert.strictEqual(resPQ.unitStr, 'PQ 500G');
        });
    });

    describe('calculateProcurementNetting (Ecuación Canónica de Neteo)', () => {
        it('unifica pedidos con idénticas características y aplica la ecuación contra stock de bodega y seguridad', () => {
            // Pedido 1: 10 Papayas de 2kg Maduro (20 kg)
            // Pedido 2: 5 Papayas de 2kg Maduro (10 kg)
            // Demanda total = 30 kg
            // Stock de bodega = 12 kg
            // Stock de seguridad = 6 kg
            // Necesidad Bruta = 30 + 6 = 36 kg
            // Stock Aplicado = min(12, 36) = 12 kg
            // Meta Neta = 36 - 12 = 24 kg
            // Compra Sugerida (+5% merma) = 24 * 1.05 = 25.2 kg
            const items: NettingOrderItem[] = [
                {
                    product_id: 'prod-papaya-1',
                    quantity: 10,
                    unit: 'und',
                    selected_options: {
                        _original_qty: 10,
                        _unit_weight_gr: 2000,
                        'Maduración': 'Maduro'
                    },
                    products: {
                        id: 'prod-papaya-1',
                        name: 'Papaya maradol',
                        purchase_sublist: 'FRUTAS',
                        unit_of_measure: 'Kg',
                        min_inventory_level: 6
                    }
                },
                {
                    product_id: 'prod-papaya-1',
                    quantity: 5,
                    unit: 'und',
                    selected_options: {
                        _original_qty: 5,
                        _unit_weight_gr: 2000,
                        'Maduración': 'Maduro'
                    },
                    products: {
                        id: 'prod-papaya-1',
                        name: 'Papaya maradol',
                        purchase_sublist: 'FRUTAS',
                        unit_of_measure: 'Kg',
                        min_inventory_level: 6
                    }
                }
            ];

            const stocks = {
                'prod-papaya-1': 12
            };

            const compiled = calculateProcurementNetting({ items, stocks });

            assert.strictEqual(compiled.length, 1, 'Debe generar exactamente UNA línea consolidada');
            const row = compiled[0];
            assert.strictEqual(row.product_name, 'Papaya maradol');
            assert.strictEqual(row.canonical_spec, 'und de 2 kg; Maduro');
            assert.strictEqual(row.order_count, 2, 'Debe registrar 2 pedidos consolidados');
            assert.strictEqual(row.raw_demand_kg, 30, 'Demanda debe ser 20 + 10 = 30 kg');
            assert.strictEqual(row.safety_stock, 6, 'Stock de seguridad debe ser 6 kg');
            assert.strictEqual(row.gross_requirement, 36, 'Necesidad bruta = 30 + 6 = 36 kg');
            assert.strictEqual(row.applied_stock, 12, 'Stock aplicado = 12 kg');
            assert.strictEqual(row.remaining_stock, 0, 'Saldo remanente de bodega = 0');
            assert.strictEqual(row.net_to_buy, 24, 'Meta neta = 24 kg');
            assert.strictEqual(row.suggested_with_merma, 25.2, 'Con 5% de merma = 25.2 kg');
        });

        it('segrega líneas cuando las características cualitativas difieren realmente', () => {
            const items: NettingOrderItem[] = [
                {
                    product_id: 'prod-papaya-1',
                    quantity: 10,
                    unit: 'kg',
                    selected_options: { 'Maduración': 'Maduro' },
                    products: {
                        id: 'prod-papaya-1',
                        name: 'Papaya maradol',
                        purchase_sublist: 'FRUTAS',
                        unit_of_measure: 'Kg'
                    }
                },
                {
                    product_id: 'prod-papaya-1',
                    quantity: 10,
                    unit: 'kg',
                    selected_options: { 'Maduración': 'Pintón' },
                    products: {
                        id: 'prod-papaya-1',
                        name: 'Papaya maradol',
                        purchase_sublist: 'FRUTAS',
                        unit_of_measure: 'Kg'
                    }
                }
            ];

            const stocks = { 'prod-papaya-1': 5 };
            const compiled = calculateProcurementNetting({ items, stocks });

            assert.strictEqual(compiled.length, 2, 'Debe haber 2 líneas separadas (Maduro y Pintón)');
            const maduro = compiled.find(r => r.canonical_spec.includes('Maduro'))!;
            const pinton = compiled.find(r => r.canonical_spec.includes('Pintón'))!;

            assert.ok(maduro, 'Debe existir fila para Maduro');
            assert.ok(pinton, 'Debe existir fila para Pintón');
            // Deducción secuencial: la primera línea consume los 5 kg de bodega
            assert.strictEqual(maduro.applied_stock, 5);
            assert.strictEqual(pinton.applied_stock, 0);
        });

        it('maneja inventario suficiente para cubrir toda la demanda y el stock de seguridad sin comprar', () => {
            const items: NettingOrderItem[] = [
                {
                    product_id: 'prod-cebolla-1',
                    quantity: 50,
                    unit: 'kg',
                    products: {
                        id: 'prod-cebolla-1',
                        name: 'Cebolla cabezona',
                        purchase_sublist: 'VERDURAS',
                        unit_of_measure: 'Kg',
                        min_inventory_level: 10
                    }
                }
            ];

            // Stock suficiente (70 kg) para cubrir demanda (50 kg) + seguridad (10 kg)
            const stocks = { 'prod-cebolla-1': 70 };
            const compiled = calculateProcurementNetting({ items, stocks });

            assert.strictEqual(compiled.length, 1);
            const row = compiled[0];
            assert.strictEqual(row.raw_demand_kg, 50);
            assert.strictEqual(row.safety_stock, 10);
            assert.strictEqual(row.gross_requirement, 60);
            assert.strictEqual(row.applied_stock, 60);
            assert.strictEqual(row.remaining_stock, 10, 'Deben sobrar 10 kg en bodega');
            assert.strictEqual(row.net_to_buy, 0, 'No requiere compra');
            assert.strictEqual(row.suggested_with_merma, 0);
        });

        it('propaga accounting_id y unidad de compra estricta del catálogo a cada línea de compra', () => {
            const items: NettingOrderItem[] = [
                {
                    product_id: 'prod-cidron-21',
                    quantity: 4,
                    unit: 'libra',
                    products: {
                        id: 'prod-cidron-21',
                        name: 'Cidron',
                        unit_of_measure: 'Atado',
                        accounting_id: 21,
                        purchase_sublist: 'HORTALIZAS'
                    }
                },
                {
                    product_id: 'prod-coliflor-1020',
                    quantity: 6,
                    unit: 'und',
                    products: {
                        id: 'prod-coliflor-1020',
                        name: 'Arbolitos de coliflor x libra',
                        unit_of_measure: 'Paquete 500 gramos',
                        accounting_id: 1020,
                        purchase_sublist: 'VERDURAS'
                    }
                }
            ];

            const compiled = calculateProcurementNetting({ items, stocks: {} });
            assert.strictEqual(compiled.length, 2);

            const cidron = compiled.find(c => c.product_id === 'prod-cidron-21')!;
            assert.strictEqual(cidron.unit, 'ATADO', 'Debe traer la unidad de compra ATADO si o si');
            assert.strictEqual(cidron.accounting_id, 21, 'Debe propagar el accounting_id 21');

            const coliflor = compiled.find(c => c.product_id === 'prod-coliflor-1020')!;
            assert.strictEqual(coliflor.unit, 'PQ 500G', 'Debe traer la unidad de compra PQ 500G si o si');
            assert.strictEqual(coliflor.accounting_id, 1020, 'Debe propagar el accounting_id 1020');
        });
    });
});
