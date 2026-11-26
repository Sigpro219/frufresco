/**
 * Escenario 496: Visibilidad No-Invasiva de Stock Familiar en Alistamiento (Impreso + OPS Digital).
 * Consolida stock por familia (parent_id || id) con homogeneidad estricta de unidad base.
 * Informativo puro: jamás muta available_stock, DT-17, picked_quantity ni inventory_movements.
 */

export interface FamilyCatalogProduct {
    id: string;
    name: string;
    accounting_id?: number | string | null;
    parent_id?: string | null;
    unit_of_measure?: string | null;
}

export interface FamilySiblingStock {
    productId: string;
    name: string;
    accountingId: number | string | null;
    unit: string;
    stock: number;
}

export interface FamilyStockSummary {
    familyRootId: string;
    ownStock: number;
    familyStock: number;
    unit: string;
    topSibling: FamilySiblingStock | null;
    extraSiblingsCount: number;
    siblingsWithStock: FamilySiblingStock[];
}

export function normalizeFamilyBaseUnit(rawUnit?: string | null): 'KG' | 'CJ' | 'DOC' | 'UN' {
    const u = (rawUnit || '').trim().toLowerCase();
    if (
        u === 'kg' || u === 'kilo' || u === 'kilos' || u === 'kilogramo' || u === 'kilogramos' ||
        u === 'lb' || u === 'libra' || u === 'libras' || u === 'g' || u === 'gr' || u === 'gramo' || u === 'gramos'
    ) {
        return 'KG';
    }
    if (u === 'cj' || u === 'caja' || u === 'cajas' || u === 'canastilla' || u === 'canastillas' || u === 'bulto' || u === 'bultos') {
        return 'CJ';
    }
    if (u === 'doc' || u === 'docena' || u === 'docenas') {
        return 'DOC';
    }
    return 'UN';
}

export function getFamilyRootId(product: { id: string; parent_id?: string | null }): string {
    return (product.parent_id && product.parent_id !== product.id) ? product.parent_id : product.id;
}

export function resolveFamilyStockSummary(params: {
    product: FamilyCatalogProduct;
    allFamilyProducts: FamilyCatalogProduct[];
    stockMap: Record<string, number>;
}): FamilyStockSummary {
    const { product, allFamilyProducts, stockMap } = params;
    const familyRootId = getFamilyRootId(product);
    const targetUnit = normalizeFamilyBaseUnit(product.unit_of_measure);
    const ownStock = Number(stockMap[product.id] || 0);

    const seenIds = new Set<string>();
    const siblingsWithStock: FamilySiblingStock[] = [];
    let familyStockRaw = 0;

    for (const member of allFamilyProducts || []) {
        if (!member?.id || seenIds.has(member.id)) continue;
        seenIds.add(member.id);

        if (getFamilyRootId(member) !== familyRootId) continue;
        if (normalizeFamilyBaseUnit(member.unit_of_measure) !== targetUnit) continue;

        const memberStock = Number(stockMap[member.id] || 0);
        if (memberStock > 0) {
            familyStockRaw += memberStock;
            if (member.id !== product.id) {
                siblingsWithStock.push({
                    productId: member.id,
                    name: member.name,
                    accountingId: member.accounting_id ?? null,
                    unit: targetUnit,
                    stock: Number(memberStock.toFixed(2))
                });
            }
        }
    }

    siblingsWithStock.sort((a, b) => b.stock - a.stock);

    return {
        familyRootId,
        ownStock: Number(ownStock.toFixed(2)),
        familyStock: Number(familyStockRaw.toFixed(2)),
        unit: targetUnit,
        topSibling: siblingsWithStock[0] || null,
        extraSiblingsCount: Math.max(0, siblingsWithStock.length - 1),
        siblingsWithStock
    };
}

export function formatFamilyStockBadgeText(summary: FamilyStockSummary): string | null {
    if (summary.ownStock > 0 || summary.familyStock <= 0 || !summary.topSibling) return null;
    const stockStr = summary.familyStock % 1 === 0 ? String(summary.familyStock) : summary.familyStock.toFixed(1);
    const idStr = summary.topSibling.accountingId !== null && summary.topSibling.accountingId !== undefined
        ? `#${summary.topSibling.accountingId}`
        : summary.topSibling.name;
    const extraStr = summary.extraSiblingsCount > 0 ? ` +${summary.extraSiblingsCount}` : '';
    return `Fam: ${stockStr} ${summary.unit} (${idStr}${extraStr})`;
}
