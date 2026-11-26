import { compareFamilyProducts } from '@/lib/productHierarchyUtils';

export interface CatalogFamilyMember {
    id: string;
    name: string;
    accounting_id?: number | string | null;
    unit_of_measure?: string | null;
    parent_id?: string | null;
    [key: string]: any;
}

export interface PurchaseRowInput {
    id?: string;
    product_id: string;
    accounting_id?: number | string | null;
    product_name: string;
    unit?: string | null;
    sublist?: string | null;
    category?: string | null;
    parent_id?: string | null;
    parent_name?: string | null;
    family_id?: string | null;
    raw_order_qty?: number | null;
    demanda_neta?: number | null;
    total_requested?: number | null;
    total_purchased?: number | null;
    stock_bodega?: number | null;
    a_comprar?: number | null;
    con_merma?: number | null;
    [key: string]: any;
}

export type HierarchicalPurchaseRowType = 'family' | 'child' | 'standalone';

export type HierarchicalPurchaseRow<T extends PurchaseRowInput = PurchaseRowInput> = T & {
    id: string;
    product_id: string;
    accounting_id?: number | string | null;
    product_name: string;
    unit: string;
    sublist: string;
    parent_id: string;
    parent_name: string;
    family_id: string;
    demanda_neta: number;
    stock_bodega: number;
    a_comprar: number;
    con_merma: number;
    row_type: HierarchicalPurchaseRowType;
    is_stock_only: boolean;
    familyTotalStock?: number;
    familyTotalDemand?: number;
    netToBuy?: number;
};

export interface BuildHierarchicalPurchaseRowsOptions {
    catalogById?: Record<string, CatalogFamilyMember>;
}

/**
 * Motor puro de agrupación jerárquica de compras (Escenario 495 / Escenario 499).
 * Agrupa por sublista -> familia (`parent_id || product_id`), detecta miembros solo-stock
 * sin crear registros en BD y consolida `familyTotalStock` (deduplicado por `product_id`),
 * `familyTotalDemand` y `netToBuy = max(0, familyTotalDemand - familyTotalStock)`.
 */
export function buildHierarchicalPurchaseRows<T extends PurchaseRowInput>(
    tasks: T[],
    catalogMembersByFamily: Record<string, CatalogFamilyMember[]>,
    stockMap: Record<string, number>,
    options?: BuildHierarchicalPurchaseRowsOptions
): HierarchicalPurchaseRow<T>[] {
    const catalogById = options?.catalogById || {};
    const bySublistMap: Record<string, T[]> = {};

    tasks.forEach((it) => {
        const sublistKey = (it.sublist || it.category || 'GENERAL').toString();
        if (!bySublistMap[sublistKey]) bySublistMap[sublistKey] = [];
        bySublistMap[sublistKey].push(it);
    });

    const compiled: HierarchicalPurchaseRow<T>[] = [];

    Object.keys(bySublistMap)
        .sort()
        .forEach((sublistKey) => {
            const sublistRows = bySublistMap[sublistKey];
            const byFamily: Record<string, T[]> = {};

            sublistRows.forEach((it) => {
                const catProd = catalogById[it.product_id];
                const rawParentId = catProd?.parent_id || it.parent_id;
                const famId =
                    it.family_id ||
                    (rawParentId && rawParentId !== it.product_id ? rawParentId : it.product_id);
                if (!byFamily[famId]) byFamily[famId] = [];
                byFamily[famId].push(it);
            });

            const familyGroups = Object.entries(byFamily).map(([famId, famDemandedRows]) => {
                const members = catalogMembersByFamily[famId] || [];
                const famProd = catalogById[famId] || members.find((m) => m.id === famId);
                const famName =
                    famProd?.name ||
                    famDemandedRows[0]?.parent_name ||
                    famDemandedRows[0]?.product_name ||
                    '';
                return { famId, famName, famProd, famDemandedRows, members };
            });

            familyGroups.sort((a, b) =>
                a.famName.localeCompare(b.famName, 'es', { sensitivity: 'base' })
            );

            familyGroups.forEach(({ famId, famName, famProd, famDemandedRows, members }) => {
                const demandedPids = new Set(famDemandedRows.map((r) => r.product_id));
                const stockOnlyMembers = members.filter(
                    (m) => !demandedPids.has(m.id) && Number(stockMap[m.id] || 0) > 0
                );

                const isHierarchicalFamily =
                    members.length >= 2 &&
                    (demandedPids.size >= 2 ||
                        stockOnlyMembers.length > 0 ||
                        famDemandedRows.some((r) => r.product_id !== famId));

                const normalizedDemandedRows: HierarchicalPurchaseRow<T>[] = famDemandedRows.map(
                    (r) => {
                        const demanda = Number(
                            r.demanda_neta ?? r.raw_order_qty ?? r.total_requested ?? 0
                        );
                        const stock =
                            stockMap[r.product_id] !== undefined
                                ? Number(stockMap[r.product_id] || 0)
                                : Number(r.stock_bodega || 0);
                        const net =
                            r.a_comprar !== undefined && r.a_comprar !== null
                                ? Number(r.a_comprar)
                                : Math.max(0, Number((demanda - stock).toFixed(2)));
                        return {
                            ...r,
                            id: r.id || r.product_id,
                            product_id: r.product_id,
                            accounting_id: r.accounting_id ?? catalogById[r.product_id]?.accounting_id,
                            product_name: r.product_name,
                            unit: (r.unit || catalogById[r.product_id]?.unit_of_measure || 'KG').toUpperCase(),
                            sublist: sublistKey,
                            parent_id: famId,
                            parent_name: famName,
                            family_id: famId,
                            demanda_neta: demanda,
                            stock_bodega: stock,
                            a_comprar: net,
                            con_merma:
                                r.con_merma !== undefined && r.con_merma !== null
                                    ? Number(r.con_merma)
                                    : net,
                            row_type: 'child',
                            is_stock_only: false,
                        };
                    }
                );

                if (!isHierarchicalFamily) {
                    normalizedDemandedRows.sort((a, b) =>
                        compareFamilyProducts(
                            { name: a.product_name, familyKey: famName },
                            { name: b.product_name, familyKey: famName }
                        )
                    );
                    normalizedDemandedRows.forEach((r) =>
                        compiled.push({
                            ...r,
                            row_type: 'standalone',
                            is_stock_only: false,
                        })
                    );
                    return;
                }

                const stockOnlyRows: HierarchicalPurchaseRow<T>[] = stockOnlyMembers.map(
                    (m) =>
                        ({
                            id: `stock-only-${sublistKey}-${m.id}`,
                            product_id: m.id,
                            accounting_id: m.accounting_id ?? null,
                            product_name: m.name,
                            parent_id: famId,
                            parent_name: famName,
                            family_id: famId,
                            sublist: sublistKey,
                            category: famDemandedRows[0]?.category ?? sublistKey,
                            unit: (m.unit_of_measure || 'KG').toUpperCase(),
                            raw_order_qty: 0,
                            demanda_neta: 0,
                            total_requested: 0,
                            total_purchased: 0,
                            stock_bodega: Number(stockMap[m.id] || 0),
                            a_comprar: 0,
                            con_merma: 0,
                            row_type: 'child',
                            is_stock_only: true,
                        } as unknown as HierarchicalPurchaseRow<T>)
                );

                const childRows: HierarchicalPurchaseRow<T>[] = [
                    ...normalizedDemandedRows,
                    ...stockOnlyRows,
                ];

                childRows.sort((a, b) => {
                    const aIsBase = a.product_id === famId ? 0 : 1;
                    const bIsBase = b.product_id === famId ? 0 : 1;
                    if (aIsBase !== bIsBase) return aIsBase - bIsBase;

                    const aStockOnly = a.is_stock_only ? 1 : 0;
                    const bStockOnly = b.is_stock_only ? 1 : 0;
                    if (aStockOnly !== bStockOnly) return aStockOnly - bStockOnly;

                    return compareFamilyProducts(
                        { name: a.product_name, familyKey: famName },
                        { name: b.product_name, familyKey: famName }
                    );
                });

                const seenFamilyPids = new Set<string>();
                const familyTotalStockRaw = childRows.reduce((sum, r) => {
                    if (seenFamilyPids.has(r.product_id)) return sum;
                    seenFamilyPids.add(r.product_id);
                    return sum + Number(r.stock_bodega || 0);
                }, 0);
                const familyTotalDemandRaw = childRows.reduce(
                    (sum, r) => sum + Number(r.demanda_neta || 0),
                    0
                );

                const familyTotalStock = Number(familyTotalStockRaw.toFixed(2));
                const familyTotalDemand = Number(familyTotalDemandRaw.toFixed(2));
                const netToBuy = Math.max(
                    0,
                    Number((familyTotalDemand - familyTotalStock).toFixed(2))
                );

                compiled.push({
                    id: `family-${sublistKey}-${famId}`,
                    product_id: famId,
                    accounting_id: famProd?.accounting_id ?? famDemandedRows[0]?.accounting_id ?? null,
                    product_name: famName,
                    parent_id: famId,
                    parent_name: famName,
                    family_id: famId,
                    sublist: sublistKey,
                    category: famDemandedRows[0]?.category ?? sublistKey,
                    unit: (famProd?.unit_of_measure || childRows[0]?.unit || 'KG').toUpperCase(),
                    raw_order_qty: familyTotalDemand,
                    demanda_neta: familyTotalDemand,
                    stock_bodega: familyTotalStock,
                    a_comprar: netToBuy,
                    con_merma: netToBuy,
                    familyTotalStock,
                    familyTotalDemand,
                    netToBuy,
                    row_type: 'family',
                    is_stock_only: false,
                } as unknown as HierarchicalPurchaseRow<T>);

                childRows.forEach((c) => compiled.push(c));
            });
        });

    return compiled;
}
