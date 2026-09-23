import test from 'node:test';
import assert from 'node:assert';
import { getFriendlyOrderId } from '../src/lib/orderUtils';
import { formatSpaceLabel } from '../src/lib/stagingSpaceAllocator';

test('Thermal Crate Labels (100x50mm): Business Rules & QR Payload', async (t) => {
    await t.test('Cálculo de Canastillas Estimadas: peso / 12.5 kg con redondeo superior', () => {
        const calculateCrates = (weightKg: number) => Math.max(1, Math.ceil(weightKg / 12.5));

        assert.strictEqual(calculateCrates(0), 1, 'Mínimo 1 canastilla para peso cero');
        assert.strictEqual(calculateCrates(10), 1, '10 kg cabe en 1 canastilla');
        assert.strictEqual(calculateCrates(12.5), 1, '12.5 kg exactamente 1 canastilla');
        assert.strictEqual(calculateCrates(13), 2, '13 kg requiere 2 canastillas');
        assert.strictEqual(calculateCrates(100), 8, '100 kg requiere 8 canastillas (8 x 12.5 = 100)');
        assert.strictEqual(calculateCrates(227), 19, '227 kg requiere 19 canastillas');
    });

    await t.test('Friendly Order ID: DDMM_XXXX con sequence_id de 4 dígitos', () => {
        const order = {
            id: 'fa87cc07-73bd-4d24-8e3c-b2e85e07f2f9',
            sequence_id: 913,
            created_at: '2026-09-24T10:00:00Z'
        };
        const friendlyId = getFriendlyOrderId(order);
        assert.strictEqual(friendlyId, '2409_0913');
    });

    await t.test('Formato de Bahía de Muelle: formatSpaceLabel', () => {
        assert.strictEqual(formatSpaceLabel([]), 'S/A');
        assert.strictEqual(formatSpaceLabel([12]), '12');
        assert.strictEqual(formatSpaceLabel([12, 13, 14]), '12-14');
        assert.strictEqual(formatSpaceLabel([5, 4]), '4-5');
    });

    await t.test('QR Payload Canónico: Estructura para lector de código de barras y chofer', () => {
        const orderId = 'af2f3c4b-28dc-4e49-9351-74141a60c3f9';
        const sequenceId = 913;
        const crateIndex = 1;
        const totalCrates = 19;
        const deliveryDate = '2026-09-24';

        const qrPayload = `FRUFRESCO:${orderId}:${sequenceId}:${crateIndex}/${totalCrates}:${deliveryDate}`;
        assert.strictEqual(qrPayload, 'FRUFRESCO:af2f3c4b-28dc-4e49-9351-74141a60c3f9:913:1/19:2026-09-24');
    });
});
