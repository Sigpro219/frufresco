import { getFriendlyOrderId } from '@/lib/orderUtils';

export interface DuplicateCollision {
    isDuplicate: boolean;
    groupKey: string;
    collisionCount: number;
    otherOrderIds: string[];
    otherFriendlyIds: string[];
    otherOrders: any[];
    matchingCriteria: {
        client: string;
        deliveryDate: string;
        address: string;
    };
    hasExactSameTotal: boolean;
    hasExactSameWeight: boolean;
    hasExactSameItems: boolean;
    hasExactSameDocument?: boolean;
    alertMessage: string;
}

/**
 * Normaliza cadenas de texto para comparaciones insensibles a mayúsculas, tildes y caracteres especiales.
 */
export function normalizeText(str?: string | null): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Normaliza direcciones eliminando abreviaciones comunes, signos, espacios y tildes.
 */
export function normalizeAddress(addr?: string | null): string {
    if (!addr) return '';
    return addr
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Obtiene la clave única del cliente (profile_id, nit o nombre de empresa).
 */
export function getOrderClientKey(order: any): string {
    if (order.profile_id) {
        return 'pid_' + order.profile_id;
    }
    if (order.profiles?.id) {
        return 'pid_' + order.profiles.id;
    }
    if (order.profile?.id) {
        return 'pid_' + order.profile.id;
    }
    const nit = normalizeText(order.customer_nit || order.profiles?.nit || order.profile?.nit);
    if (nit) {
        return 'nit_' + nit;
    }
    const name = normalizeText(order.customer_name || order.profiles?.company_name || order.profile?.company_name || order.profiles?.contact_name);
    return name ? 'name_' + name : 'order_' + order.id;
}

/**
 * Extrae la firma del documento o número de orden de compra (OC) de un pedido.
 */
export function getOrderDocumentSignature(order: any): { filename: string | null; ocNumber: string | null } {
    let filename: string | null = null;
    let ocNumber: string | null = null;

    // 1. A partir de document_url o evidence_url
    const docUrl = order.document_url || order.evidence_url || '';
    if (docUrl && typeof docUrl === 'string') {
        try {
            const urlPath = docUrl.split('?')[0];
            const rawFilename = urlPath.substring(urlPath.lastIndexOf('/') + 1);
            if (rawFilename) {
                // Eliminar prefijos de storage como UUIDs o timestamps si están presentes
                // ej: "5637e737-bae3-449e-b783-53fe34d08143_0_1_010OCC17309_.pdf" -> "1_010occ17309_.pdf"
                const clean = decodeURIComponent(rawFilename)
                    .toLowerCase()
                    .replace(/^[0-9a-f-]{36}_\d+_\d+_/i, '')
                    .replace(/^commercial_\d+_\d+_/i, '')
                    .trim();
                filename = clean || rawFilename.toLowerCase().trim();
            }
        } catch (_) {
            filename = docUrl.toLowerCase().trim();
        }
    }

    // 2. A partir de admin_notes o special_notes (donde el webhook registra los adjuntos)
    const notes = `${order.admin_notes || ''} ${order.special_notes || ''}`;
    if (!filename && notes) {
        const attMatch = notes.match(/Attachments info:\s*\[(.*?)\]/i) || notes.match(/"name":\s*"([^"]+\.pdf)"/i);
        if (attMatch) {
            const nameMatch = attMatch[0].match(/"name":\s*"([^"]+)"/i);
            if (nameMatch) {
                filename = nameMatch[1].toLowerCase().trim();
            }
        }
    }

    // 3. Extracción de número de Orden de Compra (OC / OCC / SC)
    const searchCorpus = `${filename || ''} ${notes}`;
    const ocMatch = searchCorpus.match(/(?:OC|OCC|SC|SOLPED)[#\s_-]*([0-9]{4,12})/i);
    if (ocMatch) {
        ocNumber = ocMatch[1];
    }

    return { filename, ocNumber };
}

/**
 * Determina si dos pedidos de la misma sede y fecha son duplicados reales entre sí.
 */
export function areOrdersDuplicate(orderA: any, orderB: any): boolean {
    const docA = getOrderDocumentSignature(orderA);
    const docB = getOrderDocumentSignature(orderB);

    // Caso 1: Ambos tienen número de Orden de Compra explícito
    if (docA.ocNumber && docB.ocNumber) {
        return docA.ocNumber === docB.ocNumber;
    }

    // Caso 2: Ambos tienen documento / PDF
    if (docA.filename && docB.filename) {
        return docA.filename === docB.filename;
    }

    // Caso 3: Uno tiene documento y el otro no (ej. pedido por correo vs pedido adicional por teléfono)
    if ((docA.filename || docA.ocNumber) && (!docB.filename && !docB.ocNumber)) {
        return false;
    }
    if ((!docA.filename && !docA.ocNumber) && (docB.filename || docB.ocNumber)) {
        return false;
    }

    // Caso 4: Ninguno tiene documento PDF (pedidos digitados manualmente o por WhatsApp)
    const totalA = parseFloat(orderA.total || orderA.total_amount || 0);
    const totalB = parseFloat(orderB.total || orderB.total_amount || 0);
    const weightA = parseFloat(orderA.total_weight_kg || 0);
    const weightB = parseFloat(orderB.total_weight_kg || 0);

    const sameTotal = Math.abs(totalA - totalB) < 1;
    const sameWeight = Math.abs(weightA - weightB) < 0.1;

    // Si los ítems están presentes, comparar la firma de los productos
    if (Array.isArray(orderA.order_items) && Array.isArray(orderB.order_items) && orderA.order_items.length > 0 && orderB.order_items.length > 0) {
        const getItemsSig = (items: any[]) => items
            .map((i: any) => (i.product_id || i.nickname || '') + '_' + (parseFloat(i.quantity) || 0))
            .sort()
            .join(';');
        const sigA = getItemsSig(orderA.order_items);
        const sigB = getItemsSig(orderB.order_items);
        return sigA === sigB;
    }

    if (sameTotal && sameWeight && totalA > 0) {
        return true;
    }

    return false;
}

/**
 * Detecta colisiones de pedidos duplicados:
 * 1. Mismo cliente (profile_id, NIT o razón social)
 * 2. Mismo día de entrega (delivery_date)
 * 3. Misma sede / dirección (shipping_address normalizada)
 * 4. MISMO documento PDF, MISMA OC, o idénticos productos/montos.
 *
 * Si provienen de diferentes PDFs/OCs, NO se marcan como duplicados.
 * Excluye pedidos cancelados (status === 'cancelled').
 */
export function detectDuplicateOrders(orders: any[]): Map<string, DuplicateCollision> {
    const resultMap = new Map<string, DuplicateCollision>();
    if (!orders || orders.length === 0) return resultMap;

    // 1. Agrupar órdenes activas por cliente + fecha + sede
    const activeOrders = orders.filter(o => o.status !== 'cancelled');
    const groups = new Map<string, any[]>();

    for (const order of activeOrders) {
        const clientKey = getOrderClientKey(order);
        const dateKey = order.delivery_date ? String(order.delivery_date).split('T')[0] : 'nodate';
        const rawAddress = order.shipping_address || order.profiles?.address || order.profile?.address || '';
        const addressKey = normalizeAddress(rawAddress);

        // Si no tiene fecha, no se puede asegurar colisión de día
        if (dateKey === 'nodate') continue;

        const groupKey = clientKey + '___' + dateKey + '___' + addressKey;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey).push(order);
    }

    // 2. Para cada grupo con más de 1 orden, evaluar colisiones reales
    for (const [groupKey, groupOrders] of groups.entries()) {
        if (groupOrders.length <= 1) continue;

        for (const order of groupOrders) {
            // Filtrar únicamente los hermanos que son duplicados REALES de esta orden
            const trueDuplicateSiblings = groupOrders.filter(sibling => {
                if (sibling.id === order.id) return false;
                return areOrdersDuplicate(order, sibling);
            });

            // Si no tiene colisiones de duplicado real con ningún hermano, no se marca como duplicado
            if (trueDuplicateSiblings.length === 0) {
                continue;
            }

            const otherOrderIds = trueDuplicateSiblings.map(s => s.id);
            const otherFriendlyIds = trueDuplicateSiblings.map(s => getFriendlyOrderId(s));

            // Comparación de total y peso con sus duplicados reales
            const orderTotal = parseFloat(order.total || order.total_amount || 0);
            const orderWeight = parseFloat(order.total_weight_kg || 0);

            const hasExactSameTotal = trueDuplicateSiblings.every(s => {
                const sTotal = parseFloat(s.total || s.total_amount || 0);
                return Math.abs(orderTotal - sTotal) < 1;
            });

            const hasExactSameWeight = trueDuplicateSiblings.every(s => {
                const sWeight = parseFloat(s.total_weight_kg || 0);
                return Math.abs(orderWeight - sWeight) < 0.1;
            });

            let hasExactSameItems = false;
            if (order.order_items && trueDuplicateSiblings.every(s => Array.isArray(s.order_items))) {
                const getItemsSig = (items: any[]) => items
                    .map(i => (i.product_id || i.nickname || '') + '_' + (parseFloat(i.quantity) || 0))
                    .sort()
                    .join(';');
                const mySig = getItemsSig(order.order_items);
                hasExactSameItems = trueDuplicateSiblings.every(s => getItemsSig(s.order_items) === mySig);
            }

            const docSig = getOrderDocumentSignature(order);
            const hasExactSameDocument = trueDuplicateSiblings.every(s => {
                const sDoc = getOrderDocumentSignature(s);
                return (docSig.ocNumber && sDoc.ocNumber === docSig.ocNumber) || (docSig.filename && sDoc.filename === docSig.filename);
            });

            const clientDisplayName = order.customer_name || order.profiles?.company_name || order.profile?.company_name || 'Cliente';
            const friendlySiblingsStr = otherFriendlyIds.map(f => '#' + f).join(', ');

            let alertMessage = 'Pedido duplicado: Coincide en cliente, fecha, sede y documento con ' + friendlySiblingsStr;
            if (hasExactSameTotal && hasExactSameWeight) {
                alertMessage = 'Pedido idéntico: Coincide en cliente, fecha, sede, valor ($' + Math.round(orderTotal).toLocaleString('es-CO') + ') y peso con ' + friendlySiblingsStr;
            }

            resultMap.set(order.id, {
                isDuplicate: true,
                groupKey,
                collisionCount: trueDuplicateSiblings.length + 1,
                otherOrderIds,
                otherFriendlyIds,
                otherOrders: trueDuplicateSiblings,
                matchingCriteria: {
                    client: clientDisplayName,
                    deliveryDate: order.delivery_date,
                    address: order.shipping_address || order.profiles?.address || ''
                },
                hasExactSameTotal,
                hasExactSameWeight,
                hasExactSameItems,
                hasExactSameDocument,
                alertMessage
            });
        }
    }

    return resultMap;
}
