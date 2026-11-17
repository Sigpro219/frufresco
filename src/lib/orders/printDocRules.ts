import {
    hasZombieUnpricedRemissionOverride,
    isOrderUnpricedOffAgreement,
    type BillingOrderRecordLike,
} from '@/lib/commercial/billingOrderUtils';

export interface PrintOrderDocProfile {
    role?: string | null;
    company_name?: string | null;
    document_type?: string | null;
    parent_id?: string | null;
    is_corporate_parent?: boolean | null;
    parent?: {
        document_type?: string | null;
    } | Array<{
        document_type?: string | null;
    }> | null;
}

export interface PrintOrderDocInput {
    id?: string;
    type?: string | null;
    admin_notes?: string | null;
    special_notes?: string | null;
    total?: number | null;
    total_amount?: number | null;
    logistics_data?: {
        document_type_override?: string | null;
        remission_with_prices_override?: boolean | null;
        is_gift_remission?: boolean | null;
        is_replacement?: boolean | null;
        is_b2c_gift?: boolean | null;
        is_off_agreement_split?: boolean | null;
        off_agreement_priced?: boolean | null;
    } | null;
    order_items?: Array<{
        id?: string;
        unit_price?: number | null;
        count?: number;
    }> | null;
    profiles?: PrintOrderDocProfile | PrintOrderDocProfile[] | null;
    profile?: PrintOrderDocProfile | PrintOrderDocProfile[] | null;
}

const B2B_COMPANY_REGEX =
    /(SAS|S\.A|LTDA|BIC|E\.U\.|CORP|COLSUBSIDIO|ALDIMARK|MONSERRATE|TEQUENDAMA|IRCC|COLEGIO|HOTEL|CLINICA|CAJA DE COMPENSACION|FONDO|WOK)/i;

/**
 * Determina si un pedido requiere Factura de Venta emitida en 1er Corte (FAC-IMP)
 * y por tanto debe omitirse por defecto al imprimir el lote de remisiones fisicas.
 */
export function isOrderInvoiceRequiredForPrint(order: PrintOrderDocInput | null | undefined): boolean {
    if (!order) return false;
    const ld = order.logistics_data || {};
    const notesUpper = `${order.admin_notes || ''} ${order.special_notes || ''}`.toUpperCase();
    const orderType = String(order.type || '').toLowerCase();

    // 1. Reposiciones de garantia y obsequios nunca viajan como factura de 1er corte
    const isReplacement =
        orderType === 'replacement' ||
        Boolean(ld.is_replacement) ||
        notesUpper.includes('REPOSICI') ||
        notesUpper.includes('GARANTÍA REPOSICIÓN') ||
        notesUpper.includes('GARANTIA REPOSICION');
    if (isReplacement) return false;

    const rawProf = order.profiles ?? order.profile ?? null;
    const prof = (Array.isArray(rawProf) ? rawProf[0] : rawProf) || null;
    const rawParent = prof?.parent ?? null;
    const parent = (Array.isArray(rawParent) ? rawParent[0] : rawParent) || null;

    const isB2CGift = Boolean(ld.is_b2c_gift) || notesUpper.includes('OBSEQUIO DIRECTO');
    const isGift =
        isB2CGift ||
        Boolean(ld.is_gift_remission) ||
        notesUpper.includes('REMISIÓN DE OBSEQUIO') ||
        notesUpper.includes('REMISION DE OBSEQUIO');
    if (isGift) return false;

    // 2. Excluir splits fuera de acuerdo realmente despachados a $0 sin valorizar (evidencia real en order_items)
    const billingLikeOrder: BillingOrderRecordLike = {
        id: order.id || '',
        type: order.type,
        admin_notes: order.admin_notes,
        total: order.total,
        total_amount: order.total_amount,
        logistics_data: order.logistics_data,
        order_items: order.order_items,
    };
    const isUnpricedSplit = isOrderUnpricedOffAgreement(billingLikeOrder);
    if (isUnpricedSplit) return false;

    // 3. Regla canonica: solo clientes B2B pueden operar bajo FAC-IMP (Hogar siempre viaja con remision)
    const isB2B =
        orderType.startsWith('b2b') ||
        prof?.role === 'b2b_client' ||
        Boolean(prof?.parent_id) ||
        Boolean(prof?.is_corporate_parent) ||
        Boolean(parent) ||
        Boolean(prof?.company_name && B2B_COMPANY_REGEX.test(prof.company_name));
    if (!isB2B) {
        return false;
    }

    const effectiveOverride = hasZombieUnpricedRemissionOverride(billingLikeOrder, isUnpricedSplit)
        ? null
        : ld.document_type_override;

    const resolvedDocType =
        effectiveOverride ||
        prof?.document_type ||
        parent?.document_type ||
        'remission';

    return resolvedDocType === 'invoice';
}
