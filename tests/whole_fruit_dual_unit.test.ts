import test from 'node:test';
import assert from 'node:assert';
import { buildDualUnitMetadata, resolvePhysicalInstruction } from '../src/lib/orderUtils';

test('Dual-Unit & Whole Fruit Poka-Yoke: Patilla y Melón', async (t) => {
    await t.test('Patilla 7000 gr: 1 unidad debe generar 7 kg de peso facturable y mensaje físico canónico', () => {
        const product = {
            unit_of_measure: 'Kg',
            weight_kg: 7
        };
        const result = buildDualUnitMetadata({
            quantity: 1,
            unit: 'Unidad 7000 gr',
            selectedOptions: { 'Presentación': 'Unidad 7000 gr|7000' },
            product
        });

        assert.ok(result);
        assert.strictEqual(result.billingQuantity, 7);
        assert.strictEqual(result.billingUnit, 'Kg');
        assert.strictEqual(result.physicalInstruction, '1 Unidad 7000 gr');
        assert.strictEqual(result.originalQty, 1);
        assert.strictEqual(result.originalUnit, 'Unidad');
        assert.strictEqual(result.unitWeightGr, 7000);
        assert.strictEqual(result.conversionFactor, 7);
    });

    await t.test('Patilla 7000 gr: Poka-Yoke nunca debe generar unidades fraccionarias si se ingresa < 1', () => {
        const product = {
            unit_of_measure: 'Kg',
            weight_kg: 7
        };
        const result = buildDualUnitMetadata({
            quantity: 0.143, // intento de vender fracción de patilla
            unit: 'Unidad 7000 gr',
            selectedOptions: { 'Presentación': 'Unidad 7000 gr|7000' },
            product
        });

        assert.ok(result);
        assert.strictEqual(result.originalQty, 1, 'Debe asegurar mínimo 1 fruto entero');
        assert.strictEqual(result.billingQuantity, 7, 'El peso total facturado debe ser 7 kg');
        assert.strictEqual(result.physicalInstruction, '1 Unidad 7000 gr');
    });

    await t.test('resolvePhysicalInstruction debe resolver la instrucción limpia sin la palabra estándar', () => {
        const item = {
            quantity: 2,
            unit: 'Kg',
            variant_label: 'Unidad 2000 gr estándar',
            selectedOptions: { 'Presentación': 'Unidad 2000 gr|2000' }
        };
        const instruction = resolvePhysicalInstruction(item);
        assert.strictEqual(instruction, '1 Unidad 2000 gr');
        assert.ok(!instruction?.toLowerCase().includes('estándar'));
    });
});
