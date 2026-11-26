export interface BuyerRouteHistoryRow {
    product_id: string;
    created_at: string;
    payment_method?: string | null;
    is_pre_digital_entry?: boolean | null;
    raw_data_source?: string | null;
}

export type BuyerGroupSortMode = 'route' | 'alerts' | 'alpha';

export interface BuyerSortableGroup {
    product_id: string;
    product_name_base?: string;
    product_name?: string;
    hasRejection?: boolean;
    hasDeficit?: boolean;
    hasWarning?: boolean;
    status?: string;
    delivery_date?: string;
}

const BOGOTA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calcula el ranking de ruta habitual del comprador (0.0 -> 1.0) por `product_id`
 * sobre el historial reciente de compras en Corabastos (Escenario 499 §5).
 *
 * Reglas:
 * - Filtra exclusivamente `payment_method === 'cash' || payment_method === 'credit'`.
 * - Excluye registros `is_pre_digital_entry === true` y `raw_data_source === 'COTIZACION_MANUAL_MATRIZ'`.
 * - Agrupa por jornada calendario en `America/Bogota` (`en-CA`), ordena por `created_at ASC`
 *   y calcula la posición relativa `idx / Math.max(1, N - 1)`.
 * - Toma la mediana por `product_id` únicamente cuando tenga `>= 2` jornadas distintas con muestra.
 */
export function computeBuyerRouteRanks(
    rows: BuyerRouteHistoryRow[]
): Record<string, number> {
    if (!Array.isArray(rows) || rows.length === 0) return {};

    const byDate: Record<string, Array<{ product_id: string; ts: number }>> = {};

    for (const row of rows) {
        if (!row || !row.product_id || !row.created_at) continue;
        if (row.payment_method !== 'cash' && row.payment_method !== 'credit') continue;
        if (row.is_pre_digital_entry === true) continue;
        if (row.raw_data_source === 'COTIZACION_MANUAL_MATRIZ') continue;

        const parsed = new Date(row.created_at);
        const ts = parsed.getTime();
        if (Number.isNaN(ts)) continue;

        const dateKey = BOGOTA_DATE_FORMATTER.format(parsed);
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push({ product_id: row.product_id, ts });
    }

    const positionsByProduct: Record<string, number[]> = {};
    const daysByProduct: Record<string, Set<string>> = {};

    for (const [dateKey, dayRows] of Object.entries(byDate)) {
        dayRows.sort((a, b) => a.ts - b.ts);
        const total = dayRows.length;
        const denom = Math.max(1, total - 1);

        dayRows.forEach((entry, idx) => {
            const relPos = idx / denom;
            if (!positionsByProduct[entry.product_id]) {
                positionsByProduct[entry.product_id] = [];
            }
            positionsByProduct[entry.product_id].push(relPos);

            if (!daysByProduct[entry.product_id]) {
                daysByProduct[entry.product_id] = new Set();
            }
            daysByProduct[entry.product_id].add(dateKey);
        });
    }

    const rankMap: Record<string, number> = {};
    for (const [productId, positions] of Object.entries(positionsByProduct)) {
        const distinctDays = daysByProduct[productId]?.size || 0;
        if (distinctDays >= 2 && positions.length > 0) {
            rankMap[productId] = Number(computeMedian(positions).toFixed(6));
        }
    }

    return rankMap;
}

function getGroupName(group: BuyerSortableGroup): string {
    return group.product_name_base || group.product_name || '';
}

function compareAlphaEs(a: BuyerSortableGroup, b: BuyerSortableGroup): number {
    return getGroupName(a).localeCompare(getGroupName(b), 'es', { sensitivity: 'base' });
}

function getAlertSeverity(g: BuyerSortableGroup): number {
    if (g.hasRejection) return 0;
    if (g.hasDeficit) return 1;
    if (g.hasWarning) return 2;
    if (g.status === 'partial') return 3;
    if (g.status === 'pending') return 4;
    return 5;
}

function getUrgentSeverity(g: BuyerSortableGroup): number {
    if (g.hasRejection) return 0;
    if (g.hasDeficit) return 1;
    return 2;
}

/**
 * Ordena los grupos de compra según el modo activo:
 * - `'route'`: severidad urgente (`hasRejection` / `hasDeficit`) -> `rankMap[product_id]` ascendente
 *   -> fallback `providerBodegaMap[product_id]` numérico ascendente -> fallback alfabético español.
 * - `'alerts'`: severidad completa -> fecha de entrega -> alfabético español.
 * - `'alpha'`: alfabético español.
 */
export function sortBuyerGroups<T extends BuyerSortableGroup>(
    groups: T[],
    mode: BuyerGroupSortMode,
    rankMap: Record<string, number>,
    providerBodegaMap: Record<string, number>
): T[] {
    const copy = [...groups];

    if (mode === 'alpha') {
        return copy.sort(compareAlphaEs);
    }

    if (mode === 'alerts') {
        return copy.sort((a, b) => {
            const sevDiff = getAlertSeverity(a) - getAlertSeverity(b);
            if (sevDiff !== 0) return sevDiff;

            const dateA = a.delivery_date || '9999-99-99';
            const dateB = b.delivery_date || '9999-99-99';
            const dateDiff = dateA.localeCompare(dateB);
            if (dateDiff !== 0) return dateDiff;

            return compareAlphaEs(a, b);
        });
    }

    // mode === 'route'
    return copy.sort((a, b) => {
        const urgentDiff = getUrgentSeverity(a) - getUrgentSeverity(b);
        if (urgentDiff !== 0) return urgentDiff;

        const rankA = rankMap[a.product_id];
        const rankB = rankMap[b.product_id];
        const hasRankA = typeof rankA === 'number' && Number.isFinite(rankA);
        const hasRankB = typeof rankB === 'number' && Number.isFinite(rankB);

        if (hasRankA && hasRankB) {
            if (rankA !== rankB) return rankA - rankB;
        } else if (hasRankA !== hasRankB) {
            return hasRankA ? -1 : 1;
        }

        const bodA = providerBodegaMap[a.product_id];
        const bodB = providerBodegaMap[b.product_id];
        const hasBodA = typeof bodA === 'number' && Number.isFinite(bodA);
        const hasBodB = typeof bodB === 'number' && Number.isFinite(bodB);

        if (hasBodA && hasBodB) {
            if (bodA !== bodB) return bodA - bodB;
        } else if (hasBodA !== hasBodB) {
            return hasBodA ? -1 : 1;
        }

        return compareAlphaEs(a, b);
    });
}
