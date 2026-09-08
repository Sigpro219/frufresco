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
 * Detecta colisiones de pedidos duplicados según los 3 criterios estrictos:
 * 1. Mismo cliente (profile_id, NIT o razón social)
 * 2. Mismo día de entrega (delivery_date)
 * 3. Misma sede / dirección (shipping_address normalizada)
 * 
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

    // 2. Para cada grupo con más de 1 orden, construir la metadata de colisión
    for (const [groupKey, groupOrders] of groups.entries()) {
        if (groupOrders.length <= 1) continue;

        for (const order of groupOrders) {
            const siblings = groupOrders.filter(o => o.id !== order.id);
            const otherOrderIds = siblings.map(s => s.id);
            const otherFriendlyIds = siblings.map(s => getFriendlyOrderId(s));

            // Comparación de total y peso
            const orderTotal = parseFloat(order.total || order.total_amount || 0);
            const orderWeight = parseFloat(order.total_weight_kg || 0);

            const hasExactSameTotal = siblings.every(s => {
                const sTotal = parseFloat(s.total || s.total_amount || 0);
                return Math.abs(orderTotal - sTotal) < 1;
            });

            const hasExactSameWeight = siblings.every(s => {
                const sWeight = parseFloat(s.total_weight_kg || 0);
                return Math.abs(orderWeight - sWeight) < 0.1;
            });

            // Comparación de ítems si están presentes
            let hasExactSameItems = false;
            if (order.order_items && siblings.every(s => Array.isArray(s.order_items))) {
                const getItemsSig = (items) => items
                    .map(i => (i.product_id || i.nickname || '') + '_' + (parseFloat(i.quantity) || 0))
                    .sort()
                    .join(';');
                const mySig = getItemsSig(order.order_items);
                hasExactSameItems = siblings.every(s => getItemsSig(s.order_items) === mySig);
            }

            const clientDisplayName = order.customer_name || order.profiles?.company_name || order.profile?.company_name || 'Cliente';
            const friendlySiblingsStr = otherFriendlyIds.map(f => '#' + f).join(', ');

            let alertMessage = 'Posible pedido duplicado: Coincide en cliente, fecha y sede con ' + friendlySiblingsStr;
            if (hasExactSameTotal && hasExactSameWeight) {
                alertMessage = 'Pedido idéntico: Coincide en cliente, fecha, sede, valor ($' + Math.round(orderTotal).toLocaleString('es-CO') + ') y peso con ' + friendlySiblingsStr;
            }

            resultMap.set(order.id, {
                isDuplicate: true,
                groupKey,
                collisionCount: groupOrders.length,
                otherOrderIds,
                otherFriendlyIds,
                otherOrders: siblings,
                matchingCriteria: {
                    client: clientDisplayName,
                    deliveryDate: order.delivery_date,
                    address: order.shipping_address || order.profiles?.address || ''
                },
                hasExactSameTotal,
                hasExactSameWeight,
                hasExactSameItems,
                alertMessage
            });
        }
    }

    return resultMap;
}
