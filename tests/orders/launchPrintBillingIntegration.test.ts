import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { ensureUniversalStagingSpaces } from '../../src/lib/stagingSpaceAllocator';
import { buildRelacionDocumentosSheet, type RelacionExportOrder } from '../../src/lib/exportRelacionDocumentosExcel';
import { isOrderInvoiceRequiredForPrint } from '../../src/lib/orders/printDocRules';
import {
    buildCanonicalProjectedInvoiceMap,
    compareCanonicalBillingOrder,
    getCanonicalBillingDocPriority,
    isOrderEligibleForCanonicalBilling,
    isOrderUnpricedOffAgreement,
    resolveCanonicalDocType,
    type BillingOrderRecordLike,
} from '../../src/lib/commercial/billingOrderUtils';

interface UpdatedSpaceCall {
    id: string;
    warehouse_spaces: number[];
}

interface MockSupabaseError {
    message: string;
}

function createSupabaseOrdersMock(
    seedRows: Array<{
        id: string;
        sequence_id: number;
        status: string;
        delivery_date: string;
        warehouse_spaces: number[] | null;
    }>,
    options?: {
        selectError?: MockSupabaseError | null;
        updateError?: MockSupabaseError | null;
    }
) {
    const updatedCalls: UpdatedSpaceCall[] = [];

    const client = {
        from(table: string) {
            assert.equal(table, 'orders');
            return {
                select(_cols: string) {
                    let filterDate: string | null = null;
                    let excludedStatus: string | null = null;
                    const chain = {
                        eq(col: string, val: string) {
                            if (col === 'delivery_date') filterDate = val;
                            return chain;
                        },
                        neq(col: string, val: string) {
                            if (col === 'status') excludedStatus = val;
                            if (options?.selectError) {
                                return Promise.resolve({ data: null, error: options.selectError });
                            }
                            const filtered = seedRows.filter(r =>
                                (!filterDate || r.delivery_date === filterDate) &&
                                (!excludedStatus || r.status !== excludedStatus)
                            );
                            return Promise.resolve({ data: filtered, error: null });
                        },
                    };
                    return chain;
                },
                update(payload: { warehouse_spaces: number[] }) {
                    return {
                        eq(col: string, idVal: string) {
                            assert.equal(col, 'id');
                            if (options?.updateError) {
                                return Promise.resolve({ data: null, error: options.updateError });
                            }
                            updatedCalls.push({ id: idVal, warehouse_spaces: payload.warehouse_spaces });
                            return Promise.resolve({ data: null, error: null });
                        },
                    };
                },
            };
        },
    };

    return { client, updatedCalls };
}

test('Escenario 461 — Lanzamiento, Espacios Anticolision, Impresion Exclusiva y Facturacion Canonica', async (t) => {
    await t.test('1. ensureUniversalStagingSpaces consulta ocupacion en BD por delivery_date y evita colision en Espacio 1', async () => {
        const occupiedSeeds = Array.from({ length: 92 }, (_, idx) => ({
            id: `seed-${idx + 1}`,
            sequence_id: 1700 + idx,
            status: 'para_compra',
            delivery_date: '2026-11-17',
            warehouse_spaces: [idx + 1],
        }));

        const { client, updatedCalls } = createSupabaseOrdersMock([
            ...occupiedSeeds,
            {
                id: 'ord-1809',
                sequence_id: 1809,
                status: 'pending_approval',
                delivery_date: '2026-11-17',
                warehouse_spaces: [1],
            },
        ]);

        const partialBatch = [
            {
                id: 'ord-1809',
                sequence_id: 1809,
                status: 'pending_approval',
                delivery_date: '2026-11-17',
                warehouse_spaces: [1],
                total_weight_kg: 12,
                profiles: { company_name: 'Cliente Norte SAS', address: 'Cra 15 #100' },
            },
            {
                id: 'ord-1810',
                sequence_id: 1810,
                status: 'pending_approval',
                delivery_date: '2026-11-17',
                warehouse_spaces: null,
                total_weight_kg: 15,
                profiles: { company_name: 'Cliente Centro SAS', address: 'Cra 7 #32' },
            },
            {
                id: 'ord-manana',
                sequence_id: 1820,
                status: 'para_compra',
                delivery_date: '2026-11-18',
                warehouse_spaces: null,
                total_weight_kg: 10,
                profiles: { company_name: 'Cliente Dia Siguiente', address: 'Calle 80 #20' },
            },
        ];

        const assigned = await ensureUniversalStagingSpaces(partialBatch, client);

        const assigned1809 = assigned['ord-1809'];
        const assigned1810 = assigned['ord-1810'];
        assert.equal(assigned1809.length, 1);
        assert.equal(assigned1810.length, 1);
        assert.ok(assigned1809[0] >= 93 && assigned1810[0] >= 93, 'Ninguno debe invadir bahias 1..92 ocupadas en BD');
        assert.notEqual(assigned1809[0], assigned1810[0], 'Ambas ordenes de la misma fecha deben recibir bahias distintas');
        assert.deepEqual(
            [assigned1809[0], assigned1810[0]].sort((a, b) => a - b),
            [93, 94],
            'Deben asignarse exactamente los dos siguientes slots contiguos libres (93 y 94)'
        );
        assert.deepEqual(assigned['ord-manana'], [1], 'Fecha 18-nov aislada debe iniciar limpiamente en Espacio 1');

        assert.equal(updatedCalls.length, 3, 'Debe persistir en BD los 3 pedidos asignados/reasignados');
        assert.deepEqual(updatedCalls.find(c => c.id === 'ord-1809')?.warehouse_spaces, assigned1809);
    });

    await t.test('1b. ensureUniversalStagingSpaces propaga errores PostgREST en SELECT y UPDATE sin mutar memoria en falso', async () => {
        const orderOnSelectFail = {
            id: 'ord-fail-select',
            sequence_id: 1850,
            status: 'pending_approval',
            delivery_date: '2026-11-17',
            warehouse_spaces: null as number[] | null,
            total_weight_kg: 10,
        };
        const { client: clientSelectErr } = createSupabaseOrdersMock([], {
            selectError: { message: 'PostgREST RLS SELECT blocked' },
        });

        await assert.rejects(
            () => ensureUniversalStagingSpaces([orderOnSelectFail], clientSelectErr),
            /PostgREST RLS SELECT blocked/
        );
        assert.equal(orderOnSelectFail.warehouse_spaces, null, 'No debe asignar Espacio 1 si fallo la lectura previa de BD');

        const orderOnUpdateFail = {
            id: 'ord-fail-update',
            sequence_id: 1851,
            status: 'pending_approval',
            delivery_date: '2026-11-17',
            warehouse_spaces: null as number[] | null,
            total_weight_kg: 10,
        };
        const { client: clientUpdateErr } = createSupabaseOrdersMock([], {
            updateError: { message: 'PostgREST UPDATE blocked' },
        });

        await assert.rejects(
            () => ensureUniversalStagingSpaces([orderOnUpdateFail], clientUpdateErr),
            /PostgREST UPDATE blocked/
        );
        assert.equal(orderOnUpdateFail.warehouse_spaces, null, 'No debe mutar warehouse_spaces en memoria si fallo UPDATE en Supabase');
    });

    await t.test('2. buildRelacionDocumentosSheet prohibe fallback FV {sequence_id}, soporta prefijos DIAN dinamicos y formatea rangos compactos', () => {
        const orders: Array<RelacionExportOrder & { billing_invoices?: { invoice_number?: string | null } }> = [
            {
                id: 'o-unbilled-fac',
                sequence_id: 1808,
                type: 'b2b',
                delivery_date: '2026-11-17',
                delivery_address: 'Calle 100 #15-20',
                total_amount: 450000,
                warehouse_spaces: [88],
                profiles: {
                    role: 'b2b_client',
                    company_name: 'HOLDING OPERATION SAS',
                    document_type: 'invoice',
                    contact_phone: '3101112233',
                    phone: '6010000000',
                },
            },
            {
                id: 'o-billed-cut',
                sequence_id: 1767,
                type: 'b2b',
                delivery_date: '2026-11-17',
                delivery_address: 'Av Boyaca #50-10',
                total_amount: 820000,
                warehouse_spaces: [1, 2, 3],
                billing_invoices: { invoice_number: 'FV-69592' },
                profiles: {
                    role: 'b2b_client',
                    company_name: 'COLSUBSIDIO SEDE 1',
                    document_type: 'invoice',
                    phone: '3209998877',
                },
            },
            {
                id: 'o-sett-prefix',
                sequence_id: 1768,
                type: 'b2b',
                delivery_date: '2026-11-17',
                total_amount: 310000,
                warehouse_spaces: [10],
                billing_invoices: { invoice_number: 'SETT-1050' },
                profiles: {
                    role: 'b2b_client',
                    company_name: 'TEQUENDAMA SAS',
                    document_type: 'remission',
                },
            },
            {
                id: 'o-replacement',
                sequence_id: 1805,
                type: 'b2b',
                is_replacement: true,
                delivery_date: '2026-11-17',
                total_amount: 0,
                warehouse_spaces: [40],
                profiles: {
                    role: 'b2b_client',
                    company_name: 'ALDIMARK SAS',
                    document_type: 'remission',
                },
            },
        ];

        const wb = buildRelacionDocumentosSheet(XLSX, orders, '2026-11-17');
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Informe'], { header: 1 }) as Array<Array<string | number>>;

        assert.equal(rows[3][2], 'REM 1808', 'No debe inventar FV 1808 cuando no hay factura real ni proyectada');
        assert.equal(rows[3][10], '3101112233', 'Debe tomar contact_phone desde profiles');
        assert.equal(rows[4][2], 'FV 69592', 'Debe imprimir FV 69592 desde billing_invoices.invoice_number');
        assert.equal(rows[4][5], '1-3', 'Debe formatear bahias contiguas con rango compacto 1-3');
        assert.equal(rows[4][10], '3209998877', 'Debe tomar phone desde profiles cuando no hay contact_phone');
        assert.equal(rows[5][2], 'SETT 1050', 'Debe preservar prefijo DIAN SETT sin asumir FV');
        assert.equal(rows[6][2], 'REP 1805', 'Reposicion debe rotularse REP 1805');
    });

    await t.test('3. isOrderInvoiceRequiredForPrint normaliza arreglos PostgREST, herencia matriz y precedencia Hogar', () => {
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'b2b',
                profiles: { role: 'b2b_client', document_type: 'invoice' },
            }),
            true
        );
        // Arreglo PostgREST en profiles/parent y sucursal identificada por parent_id aunque role sea 'customer'
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'standard',
                profiles: [{
                    role: 'customer',
                    parent_id: 'parent-colsubsidio',
                    document_type: null,
                    parent: [{ document_type: 'invoice' }],
                }],
            }),
            true,
            'Sucursal con parent_id y profile/parent en array PostgREST debe resolverse como B2B FAC-IMP'
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'b2b',
                logistics_data: { document_type_override: 'remission' },
                profiles: { role: 'b2b_client', document_type: 'invoice' },
            }),
            false
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'b2c',
                logistics_data: { document_type_override: 'invoice' },
                profiles: { role: 'customer', document_type: 'invoice' },
            }),
            false,
            'Cliente Hogar nunca se excluye como FAC-IMP aun con document_type_override'
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'b2b',
                total: 0,
                admin_notes: 'FUERA DE ACUERDO - DESPACHADO SIN PRECIO',
                logistics_data: { is_off_agreement_split: true, off_agreement_priced: false },
                profiles: { role: 'b2b_client', document_type: 'invoice' },
            }),
            false,
            'Split fuera de acuerdo despachado en $0 no debe excluirse como FAC-IMP'
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'b2b',
                admin_notes: 'GARANTÍA REPOSICIÓN DE CALIDAD',
                logistics_data: { is_replacement: true },
                profiles: { role: 'b2b_client', document_type: 'invoice' },
            }),
            false
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint({
                type: 'b2b',
                logistics_data: { is_gift_remission: true },
                profiles: { role: 'b2b_client', document_type: 'invoice' },
            }),
            false
        );
    });

    await t.test('4. compareCanonicalBillingOrder, isOrderEligibleForCanonicalBilling y buildCanonicalProjectedInvoiceMap (incl. Hogar override y Escenario 451)', () => {
        const orderHogarCorrupt: BillingOrderRecordLike = {
            id: 'ord-hogar',
            sequence_id: 1770,
            type: 'b2c',
            total: 95000,
            logistics_data: { document_type_override: 'invoice' },
            profiles: { role: 'customer', company_name: 'Ana Lopez', document_type: 'invoice' },
        };
        assert.equal(
            resolveCanonicalDocType(orderHogarCorrupt).rawDocType,
            'remission',
            'Hogar debe forzar REM-VALOR incluso con logistics_data.document_type_override="invoice"'
        );

        const ordReturnedFromBatch: BillingOrderRecordLike = {
            id: 'ord-batch-returned',
            sequence_id: 1766,
            type: 'b2b',
            total: 410000,
            logistics_data: { is_batch_accumulated: false },
            profiles: { role: 'b2b_client', company_name: 'RETORNO LOTE SAS', document_type: 'batch_remission' },
        };
        assert.equal(
            resolveCanonicalDocType(ordReturnedFromBatch).rawDocType,
            'batch_remission',
            'Retorno de Lote conserva rawDocType batch_remission sin ascender a invoice'
        );
        assert.equal(
            getCanonicalBillingDocPriority(ordReturnedFromBatch),
            2,
            'Retorno de Lote con is_batch_accumulated === false ordena como Remision (prio = 2, no FAC-IMP)'
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint(ordReturnedFromBatch as Parameters<typeof isOrderInvoiceRequiredForPrint>[0]),
            false,
            'Retorno de Lote nunca se excluye como FAC-IMP'
        );
        assert.equal(
            isOrderEligibleForCanonicalBilling(ordReturnedFromBatch),
            true,
            'Escenario 451: debe respetar override explicito is_batch_accumulated === false'
        );

        const ordFac1808: BillingOrderRecordLike = {
            id: 'ord-1808',
            sequence_id: 1808,
            type: 'b2b',
            total: 500000,
            profiles: { role: 'b2b_client', company_name: 'HOLDING SAS', document_type: 'invoice' },
        };
        const ordFac1790: BillingOrderRecordLike = {
            id: 'ord-1790',
            sequence_id: 1790,
            type: 'b2b',
            total: 320000,
            profiles: { role: 'b2b_client', company_name: 'MONSERRATE SAS', document_type: 'invoice' },
        };
        const ordRem1767: BillingOrderRecordLike = {
            id: 'ord-1767',
            sequence_id: 1767,
            type: 'b2b',
            total: 1200000,
            profiles: { role: 'b2b_client', company_name: 'COLSUBSIDIO SAS', document_type: 'remission' },
        };
        const ordRep1760: BillingOrderRecordLike = {
            id: 'ord-1760',
            sequence_id: 1760,
            type: 'b2b',
            origin_source: 'customer_service',
            admin_notes: 'REPOSICION CALIDAD',
            total: 0,
            logistics_data: { is_replacement: true },
            profiles: { role: 'b2b_client', company_name: 'COLSUBSIDIO SAS', document_type: 'invoice' },
        };
        const ordBatch1750: BillingOrderRecordLike = {
            id: 'ord-1750',
            sequence_id: 1750,
            type: 'b2b',
            total: 400000,
            logistics_data: { is_batch_accumulated: true },
            profiles: { role: 'b2b_client', company_name: 'LOTE SAS', document_type: 'batch_remission' },
        };
        const ordUnpricedSplit: BillingOrderRecordLike = {
            id: 'ord-unpriced',
            sequence_id: 1765,
            type: 'b2b',
            admin_notes: 'DESPACHADO SIN PRECIO',
            total: 0,
            logistics_data: { is_off_agreement_split: true, off_agreement_priced: false },
            profiles: { role: 'b2b_client', company_name: 'TEQUENDAMA SAS', document_type: 'invoice' },
        };

        const mixedList = [orderHogarCorrupt, ordRep1760, ordBatch1750, ordReturnedFromBatch, ordUnpricedSplit, ordFac1808, ordRem1767, ordFac1790];
        const sorted = [...mixedList].sort((a, b) => compareCanonicalBillingOrder(a, b));

        // FAC-IMP ASC (1790, 1808) -> REM ASC (1750, 1765, 1766, 1767, 1770) -> REP (1760)
        assert.deepEqual(
            sorted.map(o => o.sequence_id),
            [1790, 1808, 1750, 1765, 1766, 1767, 1770, 1760]
        );

        assert.equal(isOrderEligibleForCanonicalBilling(ordRep1760), false);
        assert.equal(isOrderEligibleForCanonicalBilling(ordBatch1750), false);
        assert.equal(isOrderEligibleForCanonicalBilling(ordUnpricedSplit), false);
        assert.equal(isOrderEligibleForCanonicalBilling(ordRem1767), true);
        assert.equal(isOrderEligibleForCanonicalBilling(orderHogarCorrupt), true);

        const projectedMap = buildCanonicalProjectedInvoiceMap(mixedList, 'FV', 69629);
        // 1er Corte FAC-IMP ASC: #1790 -> FV-69629, #1808 -> FV-69630
        // 2do Corte REM ASC: #1766 (Retornado de Lote) -> FV-69631, #1767 -> FV-69632, #1770 (Hogar) -> FV-69633
        assert.equal(projectedMap.get('ord-1790')?.number, 'FV-69629');
        assert.equal(projectedMap.get('ord-1808')?.number, 'FV-69630');
        assert.equal(projectedMap.get('ord-batch-returned')?.number, 'FV-69631');
        assert.equal(projectedMap.get('ord-1767')?.number, 'FV-69632');
        assert.equal(projectedMap.get('ord-hogar')?.number, 'FV-69633');
        assert.equal(projectedMap.get('ord-1760'), undefined);
        assert.equal(projectedMap.get('ord-1750'), undefined);
        assert.equal(projectedMap.get('ord-unpriced'), undefined);
    });

    await t.test('5. Escenario 464 — Anti-Falso Positivo Rem. $0 (Por Fijar) con evidencia real de order_items e inmunidad a count()', () => {
        const order1811Like: BillingOrderRecordLike = {
            id: 'ord-1811',
            sequence_id: 1811,
            type: 'b2b',
            total: 2297796,
            admin_notes: '[FUERA DE ACUERDO - DESPACHADO SIN PRECIO - PENDIENTE FIJAR TARIFA COMERCIAL: Lechuga] [Audit 11:51]',
            logistics_data: {
                off_agreement_priced: false,
                document_type_override: 'remission',
                remission_with_prices_override: false,
            },
            order_items: [
                { id: 'i1', unit_price: 7200 },
                { id: 'i2', unit_price: 8500 },
            ],
            profiles: { role: 'b2b_client', company_name: 'DIPLOMAT EMBAJADA HOTEL TRYP - TRYP', document_type: 'invoice' },
        };

        assert.equal(
            isOrderUnpricedOffAgreement(order1811Like),
            false,
            'Si todos los order_items tienen unit_price > 0, no debe marcarse como sin precio'
        );
        assert.equal(
            resolveCanonicalDocType(order1811Like).rawDocType,
            'invoice',
            'Debe descartar override zombie remission y restaurar invoice (FAC-IMP)'
        );
        assert.equal(
            isOrderInvoiceRequiredForPrint(order1811Like),
            true,
            'En impresion de remisiones debe reconocerse nuevamente como FAC-IMP'
        );

        const mixedZeroItemOrder: BillingOrderRecordLike = {
            ...order1811Like,
            id: 'ord-mixed-zero',
            total: 150000,
            order_items: [
                { id: 'i1', unit_price: 7200 },
                { id: 'i2', unit_price: 0 },
            ],
        };
        assert.equal(
            isOrderUnpricedOffAgreement(mixedZeroItemOrder),
            true,
            'Si al menos un item real tiene unit_price <= 0, debe seguir marcado para asignar precio'
        );

        const countOnlyWithTotalOrder: BillingOrderRecordLike = {
            id: 'ord-count-only',
            sequence_id: 1812,
            type: 'b2b',
            total: 500000,
            admin_notes: '[DESPACHADO SIN PRECIO]',
            logistics_data: { off_agreement_priced: false },
            order_items: [{ count: 12 }],
        };
        assert.equal(
            isOrderUnpricedOffAgreement(countOnlyWithTotalOrder),
            false,
            'Filas de solo conteo [{ count }] no deben tratarse como unit_price = 0 cuando total > 0'
        );
    });
});
