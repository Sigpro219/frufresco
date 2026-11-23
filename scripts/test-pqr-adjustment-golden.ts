import assert from 'node:assert/strict';
import {
    round2,
    round4,
    extractAgreementDiscountPct,
    pickPrimaryFvInvoice,
    parseColombianCurrencyAmount,
    isPhysicalReplacementReturn,
    isDismissedNoCostReturn,
    isCreditNoteReturn,
    isAlreadyDeductedFromOrderItems,
    isInvoiceDeductionReturn,
    matchesReturnToItem,
    allocateReturnsAcrossOrderItems,
    getNetBillableQuantity,
    getCreditNoteQuantityForItem,
    recalculateOrderTotalsFromItems,
    recalculateCreditNoteTotalsFromItems,
    computeManualCreditNoteTaxSplit,
    type BillingInvoiceLike,
    type BillingReturnLike,
    type OrderItemLike,
} from '../src/lib/commercial/pqrAdjustmentEngine';

interface TestCase {
    id: string;
    name: string;
    run: () => void;
}

const tests: TestCase[] = [
    {
        id: 'TC-01',
        name: 'Pedido #1911_1992 (pqr_ajuste_factura_legacy_deducted) no vuelve a restar Mango tommy',
        run: () => {
            const items: OrderItemLike[] = [
                {
                    id: 'oi-mango',
                    product_id: 'prod-264',
                    product_name: 'Mango tommy',
                    quantity: 45,
                    unit_price: 10990,
                    products: { id: 'prod-264', name: 'Mango tommy', accounting_id: '264', iva_rate: 0 },
                },
            ];
            const returns: BillingReturnLike[] = [
                {
                    id: 'ret-1128',
                    product_id: 'prod-264',
                    quantity: 5,
                    source: 'pqr_ajuste_factura_legacy_deducted',
                    status: 'approved',
                    reason: 'Ajuste de Factura PQR',
                },
            ];
            const summary = recalculateOrderTotalsFromItems(items, returns);
            assert.equal(summary.lines[0].netQuantity, 45);
            assert.equal(summary.lines[0].deductedQuantity, 0);
            assert.equal(summary.total, 494550);
            assert.equal(summary.tax, 0);
        },
    },
    {
        id: 'TC-02',
        name: 'Nueva Opción 4 (pqr_ajuste_factura_net) descuenta 1 sola vez sin mutar cantidad física',
        run: () => {
            const items: OrderItemLike[] = [
                {
                    id: 'oi-1',
                    product_id: 'prod-264',
                    quantity: 50,
                    unit_price: 10990,
                    products: { id: 'prod-264', iva_rate: 0 },
                },
            ];
            const returns: BillingReturnLike[] = [
                {
                    id: 'ret-1',
                    product_id: 'prod-264',
                    quantity: 5,
                    source: 'pqr_ajuste_factura_net',
                    status: 'approved',
                },
            ];
            const summary = recalculateOrderTotalsFromItems(items, returns);
            assert.equal(summary.lines[0].originalQuantity, 50);
            assert.equal(summary.lines[0].deductedQuantity, 5);
            assert.equal(summary.lines[0].netQuantity, 45);
            assert.equal(summary.total, 494550);
        },
    },
    {
        id: 'TC-03',
        name: 'IVA incluido en unit_price: productos.iva_rate=19% desglosa base e IVA sin sumar 19% extra',
        run: () => {
            const items: OrderItemLike[] = [
                {
                    id: 'oi-iva',
                    product_id: 'prod-iva',
                    quantity: 10,
                    unit_price: 11900,
                    products: { id: 'prod-iva', iva_rate: 19 },
                },
                {
                    id: 'oi-fruver',
                    product_id: 'prod-0',
                    quantity: 10,
                    unit_price: 5000,
                    products: { id: 'prod-0', iva_rate: 0 },
                },
            ];
            const summary = recalculateOrderTotalsFromItems(items, []);
            assert.equal(summary.total, 169000);
            assert.equal(summary.subtotal, 150000);
            assert.equal(summary.tax, 19000);
        },
    },
    {
        id: 'TC-04',
        name: 'IVA 5% incluido en unit_price se desglosa exactamente por línea',
        run: () => {
            const items: OrderItemLike[] = [
                {
                    id: 'oi-5',
                    product_id: 'prod-5',
                    quantity: 2,
                    unit_price: 10500,
                    products: { id: 'prod-5', iva_rate: 5 },
                },
            ];
            const summary = recalculateOrderTotalsFromItems(items, []);
            assert.equal(summary.total, 21000);
            assert.equal(summary.subtotal, 20000);
            assert.equal(summary.tax, 1000);
        },
    },
    {
        id: 'TC-05',
        name: 'Descuento comercial de acuerdo (agreement_discount_pct) recalcula base, IVA y total neto',
        run: () => {
            const pct = extractAgreementDiscountPct({ agreement_discount_pct: 10 });
            assert.equal(pct, 10);
            const items: OrderItemLike[] = [
                {
                    id: 'oi-1',
                    product_id: 'p1',
                    quantity: 10,
                    unit_price: 11900,
                    products: { id: 'p1', iva_rate: 19 },
                },
            ];
            const summary = recalculateOrderTotalsFromItems(items, [], {
                agreementDiscountPct: pct,
            });
            assert.equal(summary.grossBeforeDiscount, 119000);
            assert.equal(summary.discountAmount, 11900);
            assert.equal(summary.total, 107100);
            assert.equal(summary.subtotal, 90000);
            assert.equal(summary.tax, 17100);
        },
    },
    {
        id: 'TC-06',
        name: 'Asignación FIFO en múltiples líneas del mismo producto (sin cantidades negativas)',
        run: () => {
            const items: OrderItemLike[] = [
                { id: 'l1', product_id: 'p1', quantity: 3, unit_price: 1000, products: { iva_rate: 0 } },
                { id: 'l2', product_id: 'p1', quantity: 4, unit_price: 1000, products: { iva_rate: 0 } },
            ];
            const returns: BillingReturnLike[] = [
                { id: 'r1', product_id: 'p1', quantity: 5, source: 'pqr_ajuste_factura_net', status: 'approved' },
            ];
            const allocated = allocateReturnsAcrossOrderItems(items, returns);
            assert.equal(allocated[0].deductedQuantity, 3);
            assert.equal(allocated[0].netQuantity, 0);
            assert.equal(allocated[1].deductedQuantity, 2);
            assert.equal(allocated[1].netQuantity, 2);
            assert.equal(getNetBillableQuantity(items[1], items, returns), 2);
        },
    },
    {
        id: 'TC-07',
        name: 'Exceso de devolución se topa en 0 sin producir cantidades ni totales negativos',
        run: () => {
            const items: OrderItemLike[] = [
                { id: 'l1', product_id: 'p1', quantity: 4, unit_price: 2500, products: { iva_rate: 0 } },
            ];
            const returns: BillingReturnLike[] = [
                { id: 'r1', product_id: 'p1', quantity: 10, source: 'driver_app', status: 'approved' },
            ];
            const summary = recalculateOrderTotalsFromItems(items, returns);
            assert.equal(summary.lines[0].netQuantity, 0);
            assert.equal(summary.total, 0);
        },
    },
    {
        id: 'TC-08',
        name: 'Reposición física (replaced) y desestimado (dismissed) NO restan cantidad facturable',
        run: () => {
            const rep: BillingReturnLike = { product_id: 'p1', quantity: 5, status: 'replaced', source: 'driver_app' };
            const dis: BillingReturnLike = { product_id: 'p1', quantity: 5, status: 'dismissed', source: 'driver_app' };
            assert.equal(isPhysicalReplacementReturn(rep), true);
            assert.equal(isDismissedNoCostReturn(dis), true);
            assert.equal(isInvoiceDeductionReturn(rep), false);
            assert.equal(isInvoiceDeductionReturn(dis), false);
        },
    },
    {
        id: 'TC-09',
        name: 'Nota Crédito (pqr_nota_credito) NO descuenta la FV original y sí se suma en NC',
        run: () => {
            const items: OrderItemLike[] = [
                {
                    id: 'l1',
                    product_id: 'p1',
                    product_name: 'Aguacate Hass',
                    quantity: 20,
                    unit_price: 8000,
                    products: { id: 'p1', name: 'Aguacate Hass', accounting_id: '101', iva_rate: 0 },
                },
            ];
            const returns: BillingReturnLike[] = [
                {
                    id: 'nc1',
                    product_id: 'p1',
                    quantity: 3,
                    source: 'pqr_nota_credito',
                    credit_note_number: 'NC-1001',
                },
            ];
            const fv = recalculateOrderTotalsFromItems(items, returns);
            assert.equal(fv.lines[0].netQuantity, 20);
            assert.equal(fv.total, 160000);

            const nc = recalculateCreditNoteTotalsFromItems(items, returns, { creditNoteNumber: 'NC-1001' });
            assert.equal(nc.lines.length, 1);
            assert.equal(nc.lines[0].quantity, 3);
            assert.equal(nc.total, 24000);
            assert.equal(getCreditNoteQuantityForItem(items[0], items, returns, 'NC-1001'), 3);
        },
    },
    {
        id: 'TC-10',
        name: 'pickPrimaryFvInvoice ignora Notas Crédito (is_credit_note=true) en relaciones 1:N',
        run: () => {
            const invoices: BillingInvoiceLike[] = [
                { id: 'nc-1', invoice_number: 'NC-200', is_credit_note: true },
                { id: 'fv-1', invoice_number: 'FV-69847', is_credit_note: false },
            ];
            const picked = pickPrimaryFvInvoice(invoices);
            assert.equal(picked?.id, 'fv-1');
            assert.equal(picked?.invoice_number, 'FV-69847');
        },
    },
    {
        id: 'TC-11',
        name: 'pickPrimaryFvInvoice retorna null cuando solo existen Notas Crédito',
        run: () => {
            const invoices: BillingInvoiceLike[] = [
                { id: 'nc-1', invoice_number: 'NC-200', is_credit_note: true },
            ];
            assert.equal(pickPrimaryFvInvoice(invoices), null);
        },
    },
    {
        id: 'TC-12',
        name: 'parseColombianCurrencyAmount interpreta formatos COP con puntos y comas',
        run: () => {
            assert.equal(parseColombianCurrencyAmount('$4.727.550'), 4727550);
            assert.equal(parseColombianCurrencyAmount('1.234.567,89'), 1234567.89);
            assert.equal(parseColombianCurrencyAmount(95000), 95000);
            assert.equal(parseColombianCurrencyAmount(''), 0);
        },
    },
    {
        id: 'TC-13',
        name: 'matchesReturnToItem hace match por product_id y fallback por nombre normalizado',
        run: () => {
            const item: OrderItemLike = {
                product_id: 'p-10',
                product_name: 'Tomate Chonto',
                products: { id: 'p-10', name: 'Tomate Chonto' },
            };
            assert.equal(matchesReturnToItem({ product_id: 'p-10' }, item), true);
            assert.equal(matchesReturnToItem({ product_id: null, product_name: '  tomate   chonto ' }, item), true);
            assert.equal(matchesReturnToItem({ product_id: 'p-99', product_name: 'Tomate Chonto' }, item), false);
        },
    },
    {
        id: 'TC-14',
        name: 'Múltiples NC sobre un mismo pedido se filtran estrictamente por creditNoteNumber',
        run: () => {
            const items: OrderItemLike[] = [
                { id: 'i1', product_id: 'p1', quantity: 10, unit_price: 10000, products: { iva_rate: 0 } },
            ];
            const returns: BillingReturnLike[] = [
                { id: 'r1', product_id: 'p1', quantity: 2, source: 'pqr_nota_credito', credit_note_number: 'NC-1' },
                { id: 'r2', product_id: 'p1', quantity: 3, source: 'pqr_nota_credito', credit_note_number: 'NC-2' },
            ];
            const nc1 = recalculateCreditNoteTotalsFromItems(items, returns, { creditNoteNumber: 'NC-1' });
            const nc2 = recalculateCreditNoteTotalsFromItems(items, returns, { creditNoteNumber: 'NC-2' });
            assert.equal(nc1.total, 20000);
            assert.equal(nc2.total, 30000);
        },
    },
    {
        id: 'TC-15',
        name: 'rectificacion_muelle estándar ya descontado NO vuelve a descontar (isOffAgreementSplit=false)',
        run: () => {
            const ret: BillingReturnLike = {
                id: 'rm-1',
                product_id: 'p1',
                quantity: 4,
                source: 'rectificacion_muelle',
                status: 'pending_review',
            };
            assert.equal(isAlreadyDeductedFromOrderItems(ret, { isOffAgreementSplit: false }), true);
            assert.equal(isInvoiceDeductionReturn(ret, { isOffAgreementSplit: false }), false);
        },
    },
    {
        id: 'TC-16',
        name: 'rectificacion_muelle en Pedido B (isOffAgreementSplit=true) SÍ descuenta 1X porque muelle no mutó order_items',
        run: () => {
            const items: OrderItemLike[] = [
                { id: 'i1', product_id: 'p1', quantity: 10, unit_price: 5000, products: { iva_rate: 0 } },
            ];
            const returns: BillingReturnLike[] = [
                {
                    id: 'rm-b',
                    product_id: 'p1',
                    quantity: 4,
                    source: 'rectificacion_muelle',
                    status: 'approved',
                },
            ];
            assert.equal(isAlreadyDeductedFromOrderItems(returns[0], { isOffAgreementSplit: true }), false);
            assert.equal(isInvoiceDeductionReturn(returns[0], { isOffAgreementSplit: true }), true);
            const summary = recalculateOrderTotalsFromItems(items, returns, { isOffAgreementSplit: true });
            assert.equal(summary.lines[0].netQuantity, 6);
            assert.equal(summary.total, 30000);
        },
    },
    {
        id: 'TC-17',
        name: 'rectificacion_muelle con FAC-IMP Nota Crédito ADJ se trata como NC y nunca como ya descontado',
        run: () => {
            const ret: BillingReturnLike = {
                id: 'rm-fac',
                product_id: 'p1',
                quantity: 2,
                source: 'rectificacion_muelle',
                reason: 'FAC-IMP Nota Crédito ADJ - Producto averiado',
            };
            assert.equal(isCreditNoteReturn(ret), true);
            assert.equal(isAlreadyDeductedFromOrderItems(ret, { isOffAgreementSplit: false }), false);
            assert.equal(isInvoiceDeductionReturn(ret, { isOffAgreementSplit: false }), false);
        },
    },
    {
        id: 'TC-18',
        name: 'Nota Crédito global manual (product_id: null) nunca matchea ítems y se totaliza en NC como NC-GLOBAL',
        run: () => {
            const items: OrderItemLike[] = [
                { id: 'i1', product_id: 'p1', quantity: 5, unit_price: 10000, products: { iva_rate: 0 } },
            ];
            const globalRet: BillingReturnLike = {
                id: 'ret-global',
                product_id: null,
                product_name: 'Descuento financiero por calidad',
                quantity: 0,
                calculated_amount: 35000,
                source: 'pqr_nota_credito',
                credit_note_number: 'NC-777',
            };
            assert.equal(matchesReturnToItem(globalRet, items[0]), false);
            const nc = recalculateCreditNoteTotalsFromItems(items, [globalRet], { creditNoteNumber: 'NC-777' });
            assert.equal(nc.lines.length, 1);
            assert.equal(nc.lines[0].isManualGlobal, true);
            assert.equal(nc.lines[0].accountingId, 'NC-GLOBAL');
            assert.equal(nc.total, 35000);
            assert.equal(nc.subtotal, 35000);
            assert.equal(nc.tax, 0);
        },
    },
    {
        id: 'TC-19',
        name: 'computeManualCreditNoteTaxSplit desglosa IVA 0%, 19% y proporción orderSummary correctamente',
        run: () => {
            assert.deepEqual(computeManualCreditNoteTaxSplit(50000, 0), {
                grossTotal: 50000,
                baseTotal: 50000,
                taxTotal: 0,
                subtotal: 50000,
                tax: 0,
                total: 50000,
            });
            assert.deepEqual(computeManualCreditNoteTaxSplit(119000, 19), {
                grossTotal: 119000,
                baseTotal: 100000,
                taxTotal: 19000,
                subtotal: 100000,
                tax: 19000,
                total: 119000,
            });
            assert.deepEqual(computeManualCreditNoteTaxSplit(119000, { subtotal: 200000, tax: 38000, total: 238000 }), {
                grossTotal: 119000,
                baseTotal: 100000,
                taxTotal: 19000,
                subtotal: 100000,
                tax: 19000,
                total: 119000,
            });
        },
    },
    {
        id: 'TC-20',
        name: 'round4 preserva precisión de 4 decimales para effectiveIvaDecimal y cantidades fraccionadas',
        run: () => {
            assert.equal(round4(0.19), 0.19);
            assert.equal(round4(19 / 100), 0.19);
            assert.equal(round4(1.23456), 1.2346);
            assert.equal(round2(123.456), 123.46);
        },
    },
];

let passed = 0;
let failed = 0;

for (const tc of tests) {
    try {
        tc.run();
        passed += 1;
        console.log(`PASS ${tc.id}: ${tc.name}`);
    } catch (err) {
        failed += 1;
        console.error(`FAIL ${tc.id}: ${tc.name}`);
        console.error(err);
    }
}

console.log(`\nSummary: ${passed}/${tests.length} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
