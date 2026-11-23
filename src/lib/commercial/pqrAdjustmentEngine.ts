/**
 * Motor Canónico de Ajustes Financieros PQR, Inmunidad contra Doble Descuento
 * y Separación Fiscal FV vs. NC (Escenario 478 — SDD v1.9.433).
 *
 * Reglas invariantes:
 * 1. `order_items.unit_price` SIEMPRE incluye IVA (precio bruto al cliente).
 * 2. La tarifa de IVA se toma exclusivamente de `products.iva_rate` (Art. 424 E.T. 0% fruver),
 *    ignorando `profiles.iva_responsible`.
 * 3. Las fuentes ya descontadas físicamente (`pqr_ajuste_factura_legacy_deducted`,
 *    `rectificacion_muelle` estándar) NO vuelven a restarse de `order_items.quantity`.
 * 4. Las Notas Crédito (`is_credit_note = true` / `pqr_nota_credito`) jamás reducen la FV
 *    ni contaminan la cartera FV.
 */

export type PqrReturnSource =
    | 'pqr_ajuste_factura_legacy_deducted'
    | 'pqr_ajuste_factura_net'
    | 'pqr_nota_credito'
    | 'rectificacion_muelle'
    | 'driver_app'
    | (string & {})
    | null
    | undefined;

export interface BillingInvoiceLike {
    id?: string;
    invoice_number?: string | null;
    is_credit_note?: boolean | null;
    parent_invoice_id?: string | null;
    cut_id?: string | null;
    created_at?: string | null;
    worldoffice_sync_status?: string | null;
}

export interface BillingReturnLike {
    id?: string;
    order_id?: string | null;
    product_id?: string | null;
    product_name?: string | null;
    quantity?: number | string | null;
    quantity_returned?: number | string | null;
    unit_price?: number | string | null;
    calculated_amount?: number | string | null;
    reason?: string | null;
    status?: string | null;
    source?: PqrReturnSource;
    credit_note_number?: string | null;
    created_at?: string | null;
    products?: {
        id?: string | null;
        name?: string | null;
        accounting_id?: string | number | null;
        iva_rate?: number | string | null;
    } | null;
}

export interface OrderItemLike {
    id?: string;
    product_id?: string | null;
    product_name?: string | null;
    quantity?: number | string | null;
    picked_quantity?: number | string | null;
    selected_options?: { _charge_overweight?: boolean; [key: string]: unknown } | null;
    unit_price?: number | string | null;
    billing_unit?: string | null;
    unit?: string | null;
    product_weight_kg?: number | string | null;
    products?: {
        id?: string | null;
        name?: string | null;
        accounting_id?: string | number | null;
        iva_rate?: number | string | null;
        unit_of_measure?: string | null;
        weight_kg?: number | string | null;
    } | null;
}

export interface ReturnAllocationOptions {
    isOffAgreementSplit?: boolean;
    creditNoteNumber?: string | null;
}

export interface AllocatedOrderLine<T extends OrderItemLike = OrderItemLike> {
    item: T;
    originalQuantity: number;
    deductedQuantity: number;
    netQuantity: number;
    creditNoteQuantity: number;
    unitPriceGross: number;
    ivaRatePct: number;
    netGrossTotal: number;
    netBaseTotal: number;
    netTaxTotal: number;
    matchedReturns: BillingReturnLike[];
}

export interface OrderFinancialSummary<T extends OrderItemLike = OrderItemLike> {
    lines: AllocatedOrderLine<T>[];
    subtotal: number;
    tax: number;
    total: number;
    grossBeforeDiscount: number;
    discountAmount: number;
    agreementDiscountPct: number;
    hasDeductions: boolean;
    hasPendingReturns: boolean;
}

export interface CreditNoteLineSummary {
    productId: string | null;
    productName: string;
    accountingId: string | number | null;
    quantity: number;
    unitPriceGross: number;
    ivaRatePct: number;
    grossTotal: number;
    baseTotal: number;
    taxTotal: number;
    isManualGlobal: boolean;
    returnRecord?: BillingReturnLike;
}

export interface CreditNoteFinancialSummary {
    lines: CreditNoteLineSummary[];
    subtotal: number;
    tax: number;
    total: number;
}

export function round2(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function toSafeNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function getReturnQuantity(r: BillingReturnLike | null | undefined): number {
    if (!r) return 0;
    return toSafeNumber(r.quantity_returned ?? r.quantity);
}

export function extractAgreementDiscountPct(
    orderOrLogistics: unknown,
    profile?: unknown,
    parentProfile?: unknown
): number {
    const pickFrom = (obj: unknown): number => {
        if (!obj || typeof obj !== 'object') return 0;
        const rec = obj as Record<string, unknown>;
        const log = (rec.logistics_data && typeof rec.logistics_data === 'object'
            ? rec.logistics_data
            : rec) as Record<string, unknown>;
        const raw =
            log.agreement_discount_pct ??
            log.discount_pct ??
            log.agreementDiscountPct ??
            0;
        const pct = toSafeNumber(raw);
        return pct > 0 ? pct : 0;
    };

    const pct =
        pickFrom(orderOrLogistics) ||
        pickFrom(profile) ||
        pickFrom(parentProfile) ||
        0;
    if (pct <= 0) return 0;
    if (pct >= 100) return 100;
    return pct;
}

/**
 * Selecciona la Factura de Venta (FV) principal entre relaciones 1:N de `billing_invoices`,
 * excluyendo estrictamente Notas Crédito (`is_credit_note === true`).
 */
export function pickPrimaryFvInvoice<T extends BillingInvoiceLike>(
    invoices: T[] | T | null | undefined
): T | null {
    if (!invoices) return null;
    const list = Array.isArray(invoices) ? invoices : [invoices];
    const fvOnly = list.filter((inv) => inv && inv.is_credit_note !== true && !/^NC/i.test(String(inv.invoice_number || '').trim()));
    if (fvOnly.length === 0) return null;
    const withNumber = fvOnly.find(
        (inv) => typeof inv.invoice_number === 'string' && inv.invoice_number.trim().length > 0
    );
    return withNumber || fvOnly[0];
}

/**
 * Parsea montos en formato colombiano (`$1.250.000`, `1.250,50`) o decimal estándar.
 */
export function parseColombianCurrencyAmount(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const cleaned = value.replace(/[$\s]/g, '').trim();
    if (!cleaned) return 0;

    // Formato colombiano con coma decimal: 1.234.567,89
    if (cleaned.includes(',')) {
        const normalized = cleaned.replace(/\./g, '').replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    // Múltiples puntos o punto seguido de exactamente 3 dígitos -> separador de miles
    if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
        const normalized = cleaned.replace(/\./g, '');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function isPhysicalReplacementReturn(r: BillingReturnLike | null | undefined): boolean {
    if (!r) return false;
    if (r.status === 'replaced') return true;
    const reason = (r.reason || '').toLowerCase();
    return (
        reason.includes('reposic') ||
        reason.includes('reemplaz') ||
        reason.includes('cambio físico') ||
        reason.includes('cambio fisico')
    );
}

export function isDismissedNoCostReturn(r: BillingReturnLike | null | undefined): boolean {
    if (!r) return false;
    if (r.status === 'dismissed' || r.status === 'rejected' || r.status === 'cancelled') {
        return true;
    }
    const reason = (r.reason || '').toLowerCase();
    return (
        reason.includes('desestimad') ||
        reason.includes('sin costo') ||
        reason.includes('no procede')
    );
}

export function isCreditNoteReturn(r: BillingReturnLike | null | undefined): boolean {
    if (!r) return false;
    if (isPhysicalReplacementReturn(r) || isDismissedNoCostReturn(r)) return false;
    if (r.source === 'pqr_nota_credito') return true;
    if (typeof r.credit_note_number === 'string' && r.credit_note_number.trim().length > 0) {
        return true;
    }
    const reason = (r.reason || '').toLowerCase();
    return (
        reason.includes('nota crédito') ||
        reason.includes('nota credito') ||
        reason.includes('saldo a favor') ||
        reason.includes('[nota_credito_pqr') ||
        reason.includes('fac-imp')
    );
}

/**
 * Determina si una devolución ya fue descontada físicamente de `order_items.quantity`.
 * - `pqr_ajuste_factura_legacy_deducted`: ya fue restada en BD antes del Escenario 478.
 * - `rectificacion_muelle` (no FAC-IMP): ya fue restada en muelle SALVO cuando `isOffAgreementSplit` es true.
 */
export function isAlreadyDeductedFromOrderItems(
    r: BillingReturnLike | null | undefined,
    opts?: { isOffAgreementSplit?: boolean }
): boolean {
    if (!r) return false;
    if (r.source === 'pqr_ajuste_factura_legacy_deducted') return true;
    if (r.source === 'rectificacion_muelle') {
        if (isCreditNoteReturn(r)) return false;
        if (opts?.isOffAgreementSplit) return false;
        return true;
    }
    return false;
}

/**
 * Determina si la devolución debe restarse de `order_items.quantity` para obtener la cantidad neta facturable FV.
 */
export function isInvoiceDeductionReturn(
    r: BillingReturnLike | null | undefined,
    opts?: { isOffAgreementSplit?: boolean }
): boolean {
    if (!r) return false;
    if (isPhysicalReplacementReturn(r) || isDismissedNoCostReturn(r)) return false;
    if (isCreditNoteReturn(r)) return false;
    if (isAlreadyDeductedFromOrderItems(r, opts)) return false;
    const reasonLower = (r.reason || '').toLowerCase();
    if (r.source == null && reasonLower.trim().startsWith('[ajuste factura pqr #')) {
        return false;
    }
    const hasExplicitAdj =
        reasonLower.includes('ajuste factura') ||
        reasonLower.includes('ajuste de factura') ||
        reasonLower.includes('ajuste en factura');
    if (r.status !== 'approved' && !hasExplicitAdj) return false;
    return getReturnQuantity(r) > 0;
}

function normalizeName(name: string | null | undefined): string {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesReturnToItem(
    r: BillingReturnLike | null | undefined,
    item: OrderItemLike | null | undefined
): boolean {
    if (!r || !item) return false;
    if (r.product_id) {
        const itemPid = item.product_id || item.products?.id;
        return Boolean(itemPid && String(r.product_id) === String(itemPid));
    }
    // Global manual NC (`product_id === null`) nunca hace match con un ítem específico
    if (r.source === 'pqr_nota_credito' && r.product_id === null) {
        return false;
    }
    const rName = normalizeName(r.product_name || r.products?.name);
    const iName = normalizeName(item.product_name || item.products?.name);
    return Boolean(rName && iName && rName === iName);
}

/**
 * Asigna devoluciones y notas crédito en orden FIFO entre los `order_items` que coincidan,
 * evitando dobles descuentos y cantidades negativas.
 */
export function allocateReturnsAcrossOrderItems<T extends OrderItemLike>(
    items: T[],
    returns: BillingReturnLike[],
    opts?: ReturnAllocationOptions
): AllocatedOrderLine<T>[] {
    const safeItems = Array.isArray(items) ? items : [];
    const safeReturns = Array.isArray(returns) ? returns : [];

    const remainingDeductions = safeReturns.map((r) =>
        isInvoiceDeductionReturn(r, opts) ? Math.max(0, getReturnQuantity(r)) : 0
    );

    const remainingCreditNotes = safeReturns.map((r) => {
        if (!isCreditNoteReturn(r)) return 0;
        if (
            opts?.creditNoteNumber &&
            r.credit_note_number !== opts.creditNoteNumber
        ) {
            return 0;
        }
        return Math.max(0, getReturnQuantity(r));
    });

    return safeItems.map((item) => {
        const pickedQty = toSafeNumber(item.picked_quantity);
        const storedQty = toSafeNumber(item.quantity);
        const originalQuantity = Math.max(
            0,
            item.selected_options?._charge_overweight === true && pickedQty > storedQty
                ? pickedQty
                : storedQty
        );
        let availableForDeduction = originalQuantity;
        let deductedQuantity = 0;
        const matchedReturns: BillingReturnLike[] = [];

        safeReturns.forEach((ret, idx) => {
            if (remainingDeductions[idx] <= 0) return;
            if (!matchesReturnToItem(ret, item)) return;
            const take = Math.min(availableForDeduction, remainingDeductions[idx]);
            if (take > 0) {
                deductedQuantity = round4(deductedQuantity + take);
                availableForDeduction = round4(availableForDeduction - take);
                remainingDeductions[idx] = round4(remainingDeductions[idx] - take);
                matchedReturns.push(ret);
            }
        });

        const netQuantity = Math.max(0, round4(originalQuantity - deductedQuantity));

        let availableForCredit = netQuantity;
        let creditNoteQuantity = 0;

        safeReturns.forEach((ret, idx) => {
            if (remainingCreditNotes[idx] <= 0) return;
            if (!matchesReturnToItem(ret, item)) return;
            const take = Math.min(availableForCredit, remainingCreditNotes[idx]);
            if (take > 0) {
                creditNoteQuantity = round4(creditNoteQuantity + take);
                availableForCredit = round4(availableForCredit - take);
                remainingCreditNotes[idx] = round4(remainingCreditNotes[idx] - take);
                if (!matchedReturns.includes(ret)) {
                    matchedReturns.push(ret);
                }
            }
        });

        const unitPriceGross = Math.max(0, toSafeNumber(item.unit_price));
        const ivaRatePct = Math.max(0, toSafeNumber(item.products?.iva_rate));
        const netGrossTotal = round2(netQuantity * unitPriceGross);
        const netBaseTotal =
            ivaRatePct > 0
                ? round2(netGrossTotal / (1 + ivaRatePct / 100))
                : netGrossTotal;
        const netTaxTotal = round2(netGrossTotal - netBaseTotal);

        return {
            item,
            originalQuantity,
            deductedQuantity,
            netQuantity,
            creditNoteQuantity,
            unitPriceGross,
            ivaRatePct,
            netGrossTotal,
            netBaseTotal,
            netTaxTotal,
            matchedReturns,
        };
    });
}

export function getNetBillableQuantity(
    item: OrderItemLike,
    allItems: OrderItemLike[],
    returns: BillingReturnLike[],
    opts?: ReturnAllocationOptions
): number {
    const allocated = allocateReturnsAcrossOrderItems(allItems, returns, opts);
    const idx = allItems.indexOf(item);
    if (idx >= 0 && allocated[idx]) {
        return allocated[idx].netQuantity;
    }
    if (item.id) {
        const byId = allocated.find((l) => l.item.id === item.id);
        if (byId) return byId.netQuantity;
    }
    return Math.max(0, toSafeNumber(item.quantity));
}

export function getCreditNoteQuantityForItem(
    item: OrderItemLike,
    allItems: OrderItemLike[],
    returns: BillingReturnLike[],
    creditNoteNumber?: string | null
): number {
    const allocated = allocateReturnsAcrossOrderItems(allItems, returns, {
        creditNoteNumber: creditNoteNumber ?? undefined,
    });
    const idx = allItems.indexOf(item);
    if (idx >= 0 && allocated[idx]) {
        return allocated[idx].creditNoteQuantity;
    }
    if (item.id) {
        const byId = allocated.find((l) => l.item.id === item.id);
        if (byId) return byId.creditNoteQuantity;
    }
    return 0;
}

export function recalculateOrderTotalsFromItems<T extends OrderItemLike>(
    items: T[],
    returns: BillingReturnLike[],
    discountPctOrOpts?: number | (ReturnAllocationOptions & { agreementDiscountPct?: number }),
    maybeOpts?: ReturnAllocationOptions
): OrderFinancialSummary<T> {
    const optsObj: ReturnAllocationOptions & { agreementDiscountPct?: number } =
        typeof discountPctOrOpts === 'number'
            ? { ...(maybeOpts || {}), agreementDiscountPct: discountPctOrOpts }
            : (discountPctOrOpts || {});

    const lines = allocateReturnsAcrossOrderItems(items, returns, optsObj);
    const agreementDiscountPct = Math.max(0, Math.min(100, toSafeNumber(optsObj.agreementDiscountPct)));
    const discountFactor = 1 - agreementDiscountPct / 100;

    let grossBeforeDiscount = 0;
    let sumNetLineTotal = 0;
    let sumNetLineTax = 0;
    let hasDeductions = false;

    for (const line of lines) {
        if (line.deductedQuantity > 0) hasDeductions = true;
        grossBeforeDiscount = round2(grossBeforeDiscount + line.netGrossTotal);
        const netLineTotal = round2(line.netQuantity * line.unitPriceGross * discountFactor);
        const netLineBase =
            line.ivaRatePct > 0
                ? round2(netLineTotal / (1 + line.ivaRatePct / 100))
                : netLineTotal;
        const netLineTax = round2(netLineTotal - netLineBase);

        sumNetLineTotal += netLineTotal;
        sumNetLineTax += netLineTax;
    }

    const total = Math.round(sumNetLineTotal);
    const tax = Math.round(sumNetLineTax);
    const subtotal = total - tax;
    const discountAmount = round2(grossBeforeDiscount - total);
    const hasPendingReturns = (Array.isArray(returns) ? returns : []).some(
        (r) => r.status === 'pending_review'
    );

    return {
        lines,
        subtotal,
        tax,
        total,
        grossBeforeDiscount,
        discountAmount,
        agreementDiscountPct,
        hasDeductions,
        hasPendingReturns,
    };
}

export function computeManualCreditNoteTaxSplit(
    grossAmount: number,
    orderSummaryOrIvaPct?: { subtotal: number; tax: number; total: number } | number | null
): {
    grossTotal: number;
    baseTotal: number;
    taxTotal: number;
    subtotal: number;
    tax: number;
    total: number;
} {
    const grossTotal = Math.round(Math.max(0, toSafeNumber(grossAmount)));
    let taxTotal = 0;

    if (typeof orderSummaryOrIvaPct === 'number') {
        const rate = Math.max(0, toSafeNumber(orderSummaryOrIvaPct));
        const base = rate > 0 ? Math.round(grossTotal / (1 + rate / 100)) : grossTotal;
        taxTotal = grossTotal - base;
    } else if (
        orderSummaryOrIvaPct &&
        orderSummaryOrIvaPct.tax > 0 &&
        orderSummaryOrIvaPct.total > 0
    ) {
        const ratio = orderSummaryOrIvaPct.tax / orderSummaryOrIvaPct.total;
        taxTotal = Math.round(grossTotal * ratio);
    }

    const baseTotal = grossTotal - taxTotal;
    return {
        grossTotal,
        baseTotal,
        taxTotal,
        subtotal: baseTotal,
        tax: taxTotal,
        total: grossTotal,
    };
}

export function recalculateCreditNoteTotalsFromItems(
    items: OrderItemLike[],
    returns: BillingReturnLike[],
    discountPctOrOpts?: number | { creditNoteNumber?: string | null; agreementDiscountPct?: number },
    maybeOpts?: { creditNoteNumber?: string | null }
): CreditNoteFinancialSummary {
    const optsObj =
        typeof discountPctOrOpts === 'number'
            ? { ...(maybeOpts || {}), agreementDiscountPct: discountPctOrOpts }
            : (discountPctOrOpts || {});

    const safeReturns = Array.isArray(returns) ? returns : [];
    const allocated = allocateReturnsAcrossOrderItems(items, safeReturns, {
        creditNoteNumber: optsObj.creditNoteNumber,
    });
    const agreementDiscountPct = Math.max(0, Math.min(100, toSafeNumber(optsObj.agreementDiscountPct)));
    const discountFactor = 1 - agreementDiscountPct / 100;

    const lines: CreditNoteLineSummary[] = [];
    let sumGross = 0;
    let sumTax = 0;

    for (const line of allocated) {
        if (line.creditNoteQuantity <= 0) continue;
        const grossTotal = round2(line.creditNoteQuantity * line.unitPriceGross * discountFactor);
        const baseTotal =
            line.ivaRatePct > 0
                ? round2(grossTotal / (1 + line.ivaRatePct / 100))
                : grossTotal;
        const taxTotal = round2(grossTotal - baseTotal);

        lines.push({
            productId: line.item.product_id || line.item.products?.id || null,
            productName: line.item.product_name || line.item.products?.name || 'Producto',
            accountingId: line.item.products?.accounting_id ?? null,
            quantity: line.creditNoteQuantity,
            unitPriceGross: line.unitPriceGross,
            ivaRatePct: line.ivaRatePct,
            grossTotal,
            baseTotal,
            taxTotal,
            isManualGlobal: false,
        });

        sumGross += grossTotal;
        sumTax += taxTotal;
    }

    // Incluir Notas Crédito globales manuales (product_id === null, status === 'approved', calculated_amount > 0)
    const manualGlobalReturns = safeReturns.filter((r) => {
        if (!isCreditNoteReturn(r)) return false;
        if (r.status && r.status !== 'approved') return false;
        if (r.product_id !== null && r.product_id !== undefined) return false;
        if (
            optsObj.creditNoteNumber &&
            r.credit_note_number !== optsObj.creditNoteNumber
        ) {
            return false;
        }
        return toSafeNumber(r.calculated_amount) > 0;
    });

    if (manualGlobalReturns.length > 0) {
        const orderSummary = recalculateOrderTotalsFromItems(items, safeReturns, agreementDiscountPct);
        const effectiveRatePct =
            orderSummary.subtotal > 0 && orderSummary.tax > 0
                ? round2((orderSummary.tax / orderSummary.subtotal) * 100)
                : 0;

        for (const r of manualGlobalReturns) {
            const split = computeManualCreditNoteTaxSplit(toSafeNumber(r.calculated_amount), orderSummary);
            lines.push({
                productId: null,
                productName: r.product_name || r.reason || 'Ajuste Financiero Global (NC)',
                accountingId: 'NC-GLOBAL',
                quantity: 1,
                unitPriceGross: split.grossTotal,
                ivaRatePct: effectiveRatePct,
                grossTotal: split.grossTotal,
                baseTotal: split.baseTotal,
                taxTotal: split.taxTotal,
                isManualGlobal: true,
                returnRecord: r,
            });
            sumGross += split.grossTotal;
            sumTax += split.taxTotal;
        }
    }

    const total = Math.round(sumGross);
    const tax = Math.round(sumTax);
    const subtotal = total - tax;

    return { lines, subtotal, tax, total };
}
