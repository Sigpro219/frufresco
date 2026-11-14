import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    reduceBlindCountMovements,
    resolveInitialInventoryFromData,
    type BlindCountMovementRow,
} from '../../src/lib/inventory/resolveInitialInventory';

function makeMov(
    id: string,
    productId: string,
    refType: 'blind_count' | 'blind_count_shift_close',
    qty: number,
    createdAt: string
): BlindCountMovementRow {
    return {
        id,
        product_id: productId,
        reference_type: refType,
        notes: `Conteo físico [BLIND_COUNT_META: {"counted_quantity": ${qty}}]`,
        created_at: createdAt,
    };
}

describe('resolveInitialInventory (Escenario 457)', () => {
    it('desempata blind_count_shift_close > blind_count en la misma fecha y marca conflicto si difieren', () => {
        const movements: BlindCountMovementRow[] = [
            makeMov('m1', 'prod-hass', 'blind_count', 12, '2026-11-13T17:00:00+00:00'),
            makeMov('m2', 'prod-hass', 'blind_count_shift_close', 18.5, '2026-11-13T17:00:00+00:00'),
            makeMov('m3', 'prod-pap', 'blind_count', 38, '2026-11-13T17:00:00+00:00'),
            makeMov('m4', 'prod-pap', 'blind_count_shift_close', 38, '2026-11-13T17:00:00+00:00'),
        ];

        const { valuesByProduct, conflictProductIds } = reduceBlindCountMovements(movements);

        assert.equal(valuesByProduct['prod-hass'], 18.5);
        assert.equal(valuesByProduct['prod-pap'], 38);
        assert.deepEqual(conflictProductIds, ['prod-hass']);
    });

    it('hereda cierre del sábado al martes cuando domingo y lunes festivo no tuvieron movimientos', () => {
        const res = resolveInitialInventoryFromData({
            closing: {
                closing_date: '2026-11-07',
                is_locked: true,
                closed_by_name: 'Supervisor de Operaciones',
                snapshot_items: [
                    { productId: 'prod-1', bodegaPost10am: 25, physicalCount: 20 },
                    { productId: 'prod-2', physicalCount: 14 },
                ],
            },
            movementDate: null,
            movements: [],
            lastOperatedDate: '2026-11-07',
        });

        assert.equal(res.sourceKind, 'official_closing');
        assert.equal(res.isOfficialLocked, true);
        assert.equal(res.sourceDate, '2026-11-07');
        assert.equal(res.stockMap['prod-1'], 25); // bodegaPost10am tiene precedencia sobre physicalCount
        assert.equal(res.stockMap['prod-2'], 14);
    });

    it('clasifica correctamente unclosed_counts, reopened_closing y excel_baseline', () => {
        // 1. unclosed_counts (movimientos más recientes que el último cierre)
        const unclosed = resolveInitialInventoryFromData({
            closing: {
                closing_date: '2026-11-12',
                is_locked: true,
                closed_by_name: 'Supervisor',
                snapshot_items: [{ productId: 'prod-1', physicalCount: 10 }],
            },
            movementDate: '2026-11-13',
            movements: [makeMov('m1', 'prod-1', 'blind_count_shift_close', 42, '2026-11-13T23:00:00+00:00')],
        });
        assert.equal(unclosed.sourceKind, 'unclosed_counts');
        assert.equal(unclosed.isOfficialLocked, false);
        assert.equal(unclosed.sourceDate, '2026-11-13');
        assert.equal(unclosed.stockMap['prod-1'], 42);

        // 2. reopened_closing (is_locked === false)
        const reopened = resolveInitialInventoryFromData({
            closing: {
                closing_date: '2026-11-13',
                is_locked: false,
                closed_by_name: 'Supervisor',
                snapshot_items: [{ productId: 'prod-1', physicalCount: 15 }],
            },
            movementDate: null,
            movements: [],
        });
        assert.equal(reopened.sourceKind, 'reopened_closing');
        assert.equal(reopened.isOfficialLocked, false);

        // 3. excel_baseline
        const excel = resolveInitialInventoryFromData({
            closing: {
                closing_date: '2026-11-13',
                is_locked: true,
                closed_by_name: 'Carga Masiva Excel (Línea Base Inicial)',
                snapshot_items: [{ productId: 'prod-1', physicalCount: 99 }],
            },
            movementDate: null,
            movements: [],
        });
        assert.equal(excel.sourceKind, 'excel_baseline');
        assert.equal(excel.isOfficialLocked, false);
    });

    it('superpone movimientos Col T del mismo día sobre la línea base del cierre', () => {
        const res = resolveInitialInventoryFromData({
            closing: {
                closing_date: '2026-11-13',
                is_locked: true,
                closed_by_name: 'Supervisor',
                snapshot_items: [
                    { productId: 'prod-1', physicalCount: 10 },
                    { productId: 'prod-2', physicalCount: 5 },
                ],
            },
            movementDate: '2026-11-13',
            movements: [
                makeMov('m-overlay', 'prod-2', 'blind_count_shift_close', 19, '2026-11-13T23:30:00+00:00'),
            ],
        });

        assert.equal(res.sourceKind, 'official_closing');
        assert.equal(res.stockMap['prod-1'], 10);
        assert.equal(res.stockMap['prod-2'], 19);
    });

    it('retorna undefined (0 en consumidores) para SKUs no conteados sin fallback a calculatedStock ni inventory_stocks', () => {
        const res = resolveInitialInventoryFromData({
            closing: {
                closing_date: '2026-11-13',
                is_locked: true,
                closed_by_name: 'Supervisor',
                snapshot_items: [{ productId: 'prod-contado', physicalCount: 7 }],
            },
            movementDate: null,
            movements: [],
        });

        assert.equal(res.stockMap['prod-contado'], 7);
        assert.equal(res.stockMap['prod-no-contado'] ?? 0, 0);

        const empty = resolveInitialInventoryFromData({
            closing: null,
            movementDate: null,
            movements: [],
        });
        assert.equal(empty.sourceKind, 'none');
        assert.deepEqual(empty.stockMap, {});
    });
});
