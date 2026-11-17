import { getOrderReplacementInfo } from '@/lib/orderUtils';

export interface BillingParentProfileInfo {
    id?: string;
    role?: string | null;
    company_name?: string | null;
    razon_social?: string | null;
    document_type?: string | null;
    print_invoice?: boolean | null;
    remission_with_prices?: boolean | null;
}

export interface BillingOrderProfileInfo extends BillingParentProfileInfo {
    parent_id?: string | null;
    is_corporate_parent?: boolean | null;
}

export interface BillingOrderRecordLike {
    id: string;
    sequence_id?: number | string | null;
    status?: string | null;
    type?: string | null;
    origin_source?: string | null;
    admin_notes?: string | null;
    total?: number | null;
    total_amount?: number | null;
    invoice_number?: string | null;
    billing_invoices?: { invoice_number?: string | null } | Array<{ invoice_number?: string | null }> | null;
    logistics_data?: {
        is_batch_accumulated?: boolean | null;
        is_gift_remission?: boolean | null;
        is_off_agreement_split?: boolean | null;
        off_agreement_priced?: boolean | null;
        document_type_override?: string | null;
        is_replacement?: boolean | null;
        parent_order_id?: string | null;
        parent_sequence_id?: number | string | null;
    } | null;
    profiles?: BillingOrderProfileInfo | BillingOrderProfileInfo[] | null;
}

export interface ProjectedInvoiceEntry {
    number: string;
    index: number;
    docPriority: number;
}

const B2B_NAME_REGEX =
    /(SAS|S\.A|LTDA|BIC|E\.U\.|CORP|COLSUBSIDIO|ALDIMARK|MONSERRATE|TEQUENDAMA|IRCC|COLEGIO|HOTEL|CLINICA|CAJA DE COMPENSACION|FONDO|WOK)/i;

export function extractExistingInvoiceNumber(order: BillingOrderRecordLike | null | undefined): string | null {
    if (!order) return null;
    const bi = Array.isArray(order.billing_invoices) ? order.billing_invoices[0] : order.billing_invoices;
    const num = bi?.invoice_number || order.invoice_number;
    return num && String(num).trim().length > 0 ? String(num).trim() : null;
}

export function resolveCanonicalDocType(
    order: BillingOrderRecordLike | null | undefined,
    parentsMap: Map<string, BillingParentProfileInfo> = new Map()
): {
    rawDocType: string;
    isB2B: boolean;
    isUnpricedOffAgreement: boolean;
    isExplicitGift: boolean;
    prof: BillingOrderProfileInfo;
    parent: BillingParentProfileInfo | null;
} {
    const rawProf = order?.profiles;
    const prof: BillingOrderProfileInfo = (Array.isArray(rawProf) ? rawProf[0] : rawProf) || {};
    const parent = prof.parent_id ? parentsMap.get(prof.parent_id) || null : null;

    const isB2B =
        prof.role === 'b2b_client' ||
        order?.type === 'b2b' ||
        Boolean(prof.parent_id) ||
        Boolean(prof.is_corporate_parent) ||
        Boolean(prof.company_name && B2B_NAME_REGEX.test(prof.company_name));

    const notes = String(order?.admin_notes || '');
    const isUnpricedOffAgreement = Boolean(
        notes.includes('DESPACHADO SIN PRECIO') ||
        notes.includes('SE DESPACHÓ SIN PRECIO') ||
        (order?.logistics_data?.is_off_agreement_split && !order?.logistics_data?.off_agreement_priced)
    );

    // Hogar (!isB2B) siempre liquida como remision comercial con valor (REM-VALOR), nunca FAC-IMP/factura directa
    const clientFiscalDocType = !isB2B
        ? 'remission'
        : (prof.document_type || parent?.document_type || 'remission');

    const isExplicitGift = Boolean(
        order?.logistics_data?.is_gift_remission ||
        order?.logistics_data?.document_type_override === 'gift_remission'
    );

    const rawDocType = isExplicitGift
        ? 'gift_remission'
        : !isB2B
            ? 'remission'
            : isUnpricedOffAgreement
                ? 'remission'
                : ((order?.logistics_data?.document_type_override && !order?.logistics_data?.off_agreement_priced)
                    ? order.logistics_data.document_type_override
                    : clientFiscalDocType);

    return {
        rawDocType: String(rawDocType),
        isB2B,
        isUnpricedOffAgreement,
        isExplicitGift,
        prof,
        parent,
    };
}

/**
 * Prioridad documental canonica de facturacion:
 * 1: Facturas (FAC-IMP / 1er Corte)
 * 2: Remisiones facturables (REM / 2do Corte)
 * 3: Reposiciones (REP) y Obsequios (REM-OBSEQUIO)
 */
export function getCanonicalBillingDocPriority(
    order: BillingOrderRecordLike | null | undefined,
    parentsMap: Map<string, BillingParentProfileInfo> = new Map()
): number {
    if (!order) return 3;
    const rep = getOrderReplacementInfo(order as Parameters<typeof getOrderReplacementInfo>[0]);
    if (rep.isReplacement || order.origin_source === 'customer_service') {
        return 3;
    }
    const { rawDocType } = resolveCanonicalDocType(order, parentsMap);
    if (rawDocType === 'invoice') return 1;
    if (rawDocType === 'gift_remission') return 3;
    return 2;
}

/**
 * Determina si un pedido es elegible para emitir consecutivo fiscal FV-XXXXX.
 * Excluye reposiciones de garantia, obsequios, acumulados por lote y splits $0 sin tarificar.
 */
export function isOrderEligibleForCanonicalBilling(
    order: BillingOrderRecordLike | null | undefined,
    parentsMap: Map<string, BillingParentProfileInfo> = new Map()
): boolean {
    if (!order) return false;
    const rep = getOrderReplacementInfo(order as Parameters<typeof getOrderReplacementInfo>[0]);
    if (rep.isReplacement || order.origin_source === 'customer_service') {
        return false;
    }
    const { rawDocType, isUnpricedOffAgreement, prof } = resolveCanonicalDocType(order, parentsMap);
    const isBatchAccumulated =
        order.logistics_data?.is_batch_accumulated === false
            ? false
            : (Boolean(order.logistics_data?.is_batch_accumulated) || prof.document_type === 'batch_remission');
    if (isBatchAccumulated) {
        return false;
    }
    if (rawDocType === 'gift_remission' || isUnpricedOffAgreement) {
        return false;
    }
    return true;
}

/**
 * Comparador canonico unico para Facturacion, Cortes (PM/AM), Proyeccion FV y Planillas World Office:
 * Prioridad documental (1 -> 2 -> 3) y desempate estricto por sequence_id ASC (cronologico ascendente).
 */
export function compareCanonicalBillingOrder(
    a: BillingOrderRecordLike,
    b: BillingOrderRecordLike,
    parentsMap: Map<string, BillingParentProfileInfo> = new Map()
): number {
    const prioA = getCanonicalBillingDocPriority(a, parentsMap);
    const prioB = getCanonicalBillingDocPriority(b, parentsMap);
    if (prioA !== prioB) {
        return prioA - prioB;
    }
    const seqDiff = Number(a?.sequence_id || 0) - Number(b?.sequence_id || 0);
    if (seqDiff !== 0) {
        return seqDiff;
    }
    return String(a?.id || '').localeCompare(String(b?.id || ''));
}

/**
 * Proyecta consecutivos FV continuos (FAC-IMP primero, luego REM facturables) bajo el orden canonico unico.
 */
export function buildCanonicalProjectedInvoiceMap(
    orders: BillingOrderRecordLike[],
    invoicePrefix: string,
    invoiceNextNumber: number,
    parentsMap: Map<string, BillingParentProfileInfo> = new Map()
): Map<string, ProjectedInvoiceEntry> {
    const map = new Map<string, ProjectedInvoiceEntry>();
    if (!Array.isArray(orders) || orders.length === 0) return map;

    const sortedOrders = [...orders].sort((a, b) => compareCanonicalBillingOrder(a, b, parentsMap));
    const pendingToProject: BillingOrderRecordLike[] = [];

    sortedOrders.forEach(o => {
        const existingInv = extractExistingInvoiceNumber(o);
        if (existingInv) {
            map.set(o.id, {
                number: existingInv,
                index: 0,
                docPriority: getCanonicalBillingDocPriority(o, parentsMap),
            });
        } else if (isOrderEligibleForCanonicalBilling(o, parentsMap)) {
            pendingToProject.push(o);
        }
    });

    pendingToProject.forEach((o, idx) => {
        map.set(o.id, {
            number: `${invoicePrefix}-${invoiceNextNumber + idx}`,
            index: idx + 1,
            docPriority: getCanonicalBillingDocPriority(o, parentsMap),
        });
    });

    return map;
}
