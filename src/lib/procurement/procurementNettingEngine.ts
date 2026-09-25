/**
 * @file procurementNettingEngine.ts
 * @description Motor Canónico Unificado de Neteo de Compras e Inventarios (Cross-Docking / JIT).
 * 
 * Regla de Oro SDD v1.9.2:
 * 1. La compra en Corabastos se determina neteando la demanda consolidada con idénticas características
 *    frente al stock físico disponible en bodega a la hora de corte (17:00 / 18:00) y el stock de seguridad.
 * 2. Unificación Estricta: Pedidos con las mismas características canónicas (calibre/peso unitario y grado de madurez)
 *    deben sumarse en una única línea de compra, sin fragmentarse por cantidades individuales de cliente ni textos libres.
 * 3. Ecuación Canónica de Neteo:
 *    - Necesidad Bruta = Demanda Consolidada (Kg) + Stock de Seguridad (min_inventory_level)
 *    - Stock Aplicado  = min(Stock Disponible en Bodega, Necesidad Bruta)
 *    - Meta Neta       = max(0, Necesidad Bruta - Stock Disponible)
 *    - Compra Sugerida = round(Meta Neta * (1 + mermaFactor), 1)   [Default +5% merma]
 * 4. Deducción Secuencial: El stock de bodega e inventario de seguridad se aplican primero a la línea estándar base
 *    y el remanente a variantes especializadas, evitando duplicar amortiguadores.
 */

import { isRedundantAttribute } from '@/lib/orderUtils';

export interface ProductCatalogMeta {
    id: string;
    name: string;
    parent_id?: string | null;
    unit_of_measure?: string | null;
    purchase_sublist?: string | null;
    min_inventory_level?: number | string | null;
    weight_kg?: number | null;
    accounting_id?: number | string | null;
}

export interface NettingOrderItem {
    id?: string;
    order_id?: string;
    product_id: string;
    product_name?: string | null;
    quantity: number;
    unit?: string | null;
    selected_options?: Record<string, any> | null;
    variant_label?: string | null;
    nickname?: string | null;
    delivery_date?: string | null;
    accounting_id?: number | string | null;
    products?: {
        id?: string;
        name?: string | null;
        parent_id?: string | null;
        unit_of_measure?: string | null;
        purchase_sublist?: string | null;
        min_inventory_level?: number | string | null;
        weight_kg?: number | null;
        accounting_id?: number | string | null;
    } | null;
}

export interface CompiledNettingItem {
    key: string;
    product_id: string;
    product_name: string;
    parent_id?: string | null;
    parent_name: string;
    sublist: string;
    unit: string;
    canonical_spec: string;
    raw_demand_kg: number;
    safety_stock: number;
    gross_requirement: number;
    applied_stock: number;
    remaining_stock: number;
    net_to_buy: number;
    suggested_with_merma: number;
    order_count: number;
    accounting_id?: number | string | null;
}

export interface NettingEngineOptions {
    mermaFactor?: number;          // Default 0.05 (+5%)
    applySafetyStock?: boolean;     // Default true
}

/**
 * Extrae la especificación canónica cualitativa/operativa del producto.
 * Retorna exclusivamente características intrínsecas (ej: "und de 2 kg; Maduro", "und de 160 gr; Pintón", "bandeja de 500 gr").
 * Excluye cantidades transaccionales de clientes individuales ("10 und") y rechaza textos libres ("bananos", "1000 gr").
 * Retorna "" para productos estándar sin variantes especializadas.
 */
export function getCanonicalProcurementSpec(item: {
    selected_options?: Record<string, any> | null;
    variant_label?: string | null;
    nickname?: string | null;
    product_name?: string | null;
    product?: { name?: string | null; [key: string]: any } | null;
}): string {
    if (!item) return '';

    const prodName = item.product?.name || item.product_name || null;
    const opts = item.selected_options || {};
    let unitWeightPart = '';
    const attributeParts: string[] = [];

    // 1. Extraer calibre o peso de presentación unitaria (SIN la cantidad del pedido)
    const unitWeightGr = opts._unit_weight_gr || opts.unit_weight_gr;
    const origUnit = (opts._original_unit || opts.original_unit || 'und').toLowerCase();
    const isBandejaOpt = origUnit.includes('bandeja');

    if (unitWeightGr && Number(unitWeightGr) > 0) {
        const gr = Number(unitWeightGr);
        const weightStr = gr >= 1000 
            ? ((gr / 1000) % 1 === 0 ? (gr / 1000).toString() : (gr / 1000).toFixed(1)) + ' kg'
            : `${gr} gr`;
        unitWeightPart = `${isBandejaOpt ? 'bandeja' : 'und'} de ${weightStr}`;
    } else {
        // Fallback estructurado en texto de presentación (ej. "Unidad 2000 gr", "Bandeja 500 gr")
        const pres = (opts['Presentación'] || opts['Presentacion'] || '') as string;
        const matchGr = typeof pres === 'string' ? pres.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i) : null;
        if (matchGr) {
            const gr = parseFloat(matchGr[1].replace(',', '.'));
            const weightStr = gr >= 1000 ? `${gr / 1000} kg` : `${gr} gr`;
            const isBandeja = /bandeja/i.test(pres);
            unitWeightPart = `${isBandeja ? 'bandeja' : 'und'} de ${weightStr}`;
        }
    }

    // 2. Extraer atributos culinarios estructurados (Maduración, Corte, Calibre, Punto, Especificación)
    const knownKeys = ['Maduración', 'Maduracion', 'Corte', 'Calibre', 'Punto', 'Especificación', 'Especificacion'];
    knownKeys.forEach(k => {
        if (opts[k] && typeof opts[k] === 'string' && opts[k].trim()) {
            const val = opts[k].trim();
            if (!/^\d+$/.test(val) && val.toLowerCase() !== 'estandar' && val.toLowerCase() !== 'estándar') {
                if (!isRedundantAttribute(val, prodName)) {
                    attributeParts.push(val);
                }
            }
        }
    });

    const attrStr = attributeParts.join(', ');
    if (unitWeightPart && attrStr) return `${unitWeightPart}; ${attrStr}`;
    if (unitWeightPart) return unitWeightPart;
    if (attrStr) return attrStr;
    return '';
}

/**
 * Resuelve la Unidad Maestra de Compra del catálogo ("si o si, la unidad de compra").
 * Mapea canónicamente las unidades maestras de Corabastos:
 * - 'Kg' / 'Kilogramo' -> 'KG'
 * - 'Unidad' / 'Und' -> 'UN'
 * - 'Atado' -> 'ATADO'
 * - 'Paquete 500 gramos' -> 'PQ 500G'
 * - 'Paquete 250 gramos' -> 'PQ 250G'
 * - 'Bandeja' -> 'BANDEJA'
 * - 'Bolsa' -> 'BOLSA'
 * - 'Bulto' -> 'BULTO'
 * - 'Caja' -> 'CJ'
 * - 'Cubeta' -> 'CUBETA'
 * - 'Docena' -> 'DOC'
 * - 'Libra' -> 'LB'
 * Si no se encuentra unidad maestra en catálogo, utiliza el fallback o 'KG'.
 */
export function resolvePurchaseUnit(productUom?: string | null, fallbackUnit?: string | null): string {
    const raw = (productUom || fallbackUnit || '').trim().toLowerCase();
    if (!raw) return 'KG';
    if (raw === 'kg' || raw === 'kilo' || raw === 'kilos' || raw === 'kilogramo' || raw === 'kilogramos') return 'KG';
    if (raw === 'unidad' || raw === 'un' || raw === 'und' || raw === 'unidades') return 'UN';
    if (raw === 'atado' || raw === 'atados') return 'ATADO';
    if (raw === 'bandeja' || raw === 'bandejas') return 'BANDEJA';
    if (raw === 'bolsa' || raw === 'bolsas') return 'BOLSA';
    if (raw === 'bulto' || raw === 'bultos') return 'BULTO';
    if (raw === 'caja' || raw === 'cajas' || raw === 'cj') return 'CJ';
    if (raw === 'cubeta' || raw === 'cubetas') return 'CUBETA';
    if (raw === 'docena' || raw === 'docenas' || raw === 'doc') return 'DOC';
    if (raw.includes('paquete 500')) return 'PQ 500G';
    if (raw.includes('paquete 250')) return 'PQ 250G';
    if (raw.includes('paquete') || raw === 'pq') return 'PAQUETE';
    if (raw === 'libra' || raw === 'lb' || raw === 'lbs') return 'LB';
    return raw.toUpperCase();
}

/**
 * Normaliza cualquier cantidad y unidad a la Unidad Maestra de Compra/Catálogo (KG, UN, CJ, DOC, etc.).
 */
export function normalizeDemandToKg(params: {
    quantity: number;
    rawUnit?: string | null;
    productUom?: string | null;
    selectedOptions?: Record<string, any> | null;
    variantLabel?: string | null;
    productWeightKg?: number | null;
}): { effectiveQty: number; unitStr: string } {
    const { quantity, rawUnit, productUom, selectedOptions, variantLabel, productWeightKg } = params;
    const cleanUom = (productUom || '').trim().toLowerCase();
    const cleanRaw = (rawUnit || '').trim().toLowerCase();
    const opts = selectedOptions || {};
    const presText = (opts['Presentación'] || opts['Presentacion'] || variantLabel || rawUnit || '') as string;

    const isMasterUnidad = cleanUom === 'unidad' || cleanUom === 'un' || cleanUom === 'und';
    const isMasterCaja = cleanUom.includes('caja') || cleanRaw.includes('caja');
    const isMasterDocena = cleanUom.includes('docena') || cleanRaw.includes('docena');
    const isMasterAtado = cleanUom.includes('atado') || cleanRaw.includes('atado');
    const isMasterBandeja = cleanUom.includes('bandeja');
    const isMasterBolsa = cleanUom.includes('bolsa');
    const isMasterBulto = cleanUom.includes('bulto');
    const isMasterCubeta = cleanUom.includes('cubeta');

    if (isMasterUnidad) {
        return { effectiveQty: quantity, unitStr: 'UN' };
    }
    if (isMasterAtado) {
        return { effectiveQty: quantity, unitStr: 'ATADO' };
    }
    if (isMasterCaja) {
        return { effectiveQty: quantity, unitStr: 'CJ' };
    }
    if (isMasterDocena) {
        return { effectiveQty: quantity, unitStr: 'DOC' };
    }
    if (isMasterBandeja) {
        return { effectiveQty: quantity, unitStr: 'BANDEJA' };
    }
    if (isMasterBolsa) {
        return { effectiveQty: quantity, unitStr: 'BOLSA' };
    }
    if (isMasterBulto) {
        return { effectiveQty: quantity, unitStr: 'BULTO' };
    }
    if (isMasterCubeta) {
        return { effectiveQty: quantity, unitStr: 'CUBETA' };
    }
    if (cleanUom.includes('paquete 500')) {
        let effQty = quantity;
        if (cleanRaw.includes('kg')) {
            effQty = quantity / 0.5;
        }
        return { effectiveQty: effQty, unitStr: 'PQ 500G' };
    }
    if (cleanUom.includes('paquete 250')) {
        let effQty = quantity;
        if (cleanRaw.includes('kg')) {
            effQty = quantity / 0.25;
        } else if (cleanRaw.includes('libra')) {
            effQty = quantity * 2;
        }
        return { effectiveQty: effQty, unitStr: 'PQ 250G' };
    }

    let effectiveKg = quantity;
    const origQty = opts._original_qty || opts.original_qty;
    const unitWeightGr = opts._unit_weight_gr || opts.unit_weight_gr;

    if (origQty && unitWeightGr && Number(unitWeightGr) > 0) {
        const calculatedKg = Number(origQty) * (Number(unitWeightGr) / 1000);
        effectiveKg = calculatedKg > 0 ? calculatedKg : quantity;
    } else {
        const matchGr = typeof presText === 'string' ? presText.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i) : null;
        const matchKg = !matchGr && typeof presText === 'string' ? presText.match(/(?:Unidad(?:es)?|Und|U)\s*(\d+(?:[.,]\d+)?)\s*(?:kg|kilos)/i) : null;

        if (matchGr) {
            const gr = parseFloat(matchGr[1].replace(',', '.'));
            const kgPerUnit = gr / 1000;
            if (cleanRaw.includes('unidad') || cleanRaw.includes('und') || /unidad|und/i.test(presText)) {
                effectiveKg = quantity * kgPerUnit;
            }
        } else if (matchKg) {
            const kgPerUnit = parseFloat(matchKg[1].replace(',', '.'));
            if (cleanRaw.includes('unidad') || cleanRaw.includes('und') || /unidad|und/i.test(presText)) {
                effectiveKg = quantity * kgPerUnit;
            }
        } else if ((cleanRaw.includes('unidad') || cleanRaw.includes('und')) && productWeightKg && productWeightKg > 0 && productWeightKg !== 1) {
            effectiveKg = quantity * productWeightKg;
        } else if (cleanRaw.includes('libra') || cleanRaw === 'lb' || cleanRaw === 'lbs') {
            effectiveKg = quantity * 0.5;
        } else if (/^1000\s*(g|gr|gramos)$/i.test(cleanRaw)) {
            effectiveKg = quantity;
        } else if (/500\s*(g|gr|gramos)/i.test(cleanRaw) || cleanUom.includes('paquete 500')) {
            effectiveKg = quantity * 0.5;
        } else if (/250\s*(g|gr|gramos)/i.test(cleanRaw) || cleanUom.includes('paquete 250')) {
            effectiveKg = quantity * 0.25;
        } else if (/^(\d+)\s*(g|gr|gramos)$/i.test(cleanRaw)) {
            const match = cleanRaw.match(/^(\d+)\s*(g|gr|gramos)$/i);
            const grams = parseFloat(match![1]);
            effectiveKg = (quantity * grams) / 1000;
        }
    }

    const finalUnit = resolvePurchaseUnit(productUom, 'KG');
    return { effectiveQty: effectiveKg, unitStr: finalUnit };
}

/**
 * Motor de Cálculo Centralizado de Neteo de Compras (Procurement Netting Engine).
 * 
 * Agrupa la demanda de pedidos activos por características canónicas idénticas,
 * deduce el inventario disponible de bodega y añade el stock de seguridad del catálogo.
 */
export function calculateProcurementNetting(params: {
    items: NettingOrderItem[];
    stocks: Record<string, number>;
    catalogProducts?: Record<string, ProductCatalogMeta>;
    options?: NettingEngineOptions;
}): CompiledNettingItem[] {
    const { items, stocks, catalogProducts = {}, options = {} } = params;
    const mermaFactor = options.mermaFactor !== undefined ? options.mermaFactor : 0.05;
    const applySafetyStock = options.applySafetyStock !== undefined ? options.applySafetyStock : true;

    // 1. Agregar demanda por producto y especificación canónica unificada
    const aggregatedMap: Record<string, {
        product_id: string;
        product_name: string;
        parent_id?: string | null;
        sublist: string;
        unit: string;
        canonical_spec: string;
        raw_demand_kg: number;
        min_inventory_level: number;
        order_count: number;
        accounting_id?: number | string | null;
    }> = {};

    items.forEach(it => {
        const pId = it.product_id || it.products?.id;
        if (!pId) return;

        const prodCatalog = catalogProducts[pId] || it.products;
        const pName = prodCatalog?.name || it.product_name || it.nickname || 'Producto Desconocido';
        const sublist = (prodCatalog?.purchase_sublist || 'GENERAL CORABASTOS').toUpperCase().trim();
        const parentId = prodCatalog?.parent_id || null;
        const minInv = prodCatalog?.min_inventory_level ? parseFloat(String(prodCatalog.min_inventory_level)) : 0;

        // Extraer especificación canónica (unifica órdenes con las mismas características)
        const canonicalSpec = getCanonicalProcurementSpec({
            selected_options: it.selected_options,
            variant_label: it.variant_label,
            nickname: it.nickname,
            product_name: pName,
            product: { name: pName }
        });

        const norm = normalizeDemandToKg({
            quantity: Number(it.quantity) || 0,
            rawUnit: it.unit,
            productUom: prodCatalog?.unit_of_measure,
            selectedOptions: it.selected_options,
            variantLabel: it.variant_label,
            productWeightKg: prodCatalog?.weight_kg
        });

        // Garantizar que la unidad de compra provenga SI O SI de la unidad de medida maestra del catálogo
        const purchaseUnit = resolvePurchaseUnit(prodCatalog?.unit_of_measure, norm.unitStr);

        const groupKey = `${pId}__${canonicalSpec}`;

        if (!aggregatedMap[groupKey]) {
            aggregatedMap[groupKey] = {
                product_id: pId,
                product_name: pName,
                parent_id: parentId,
                sublist,
                unit: purchaseUnit,
                canonical_spec: canonicalSpec,
                raw_demand_kg: 0,
                min_inventory_level: minInv,
                order_count: 0,
                accounting_id: prodCatalog?.accounting_id ?? it.accounting_id ?? null
            };
        }

        aggregatedMap[groupKey].raw_demand_kg += norm.effectiveQty;
        aggregatedMap[groupKey].order_count += 1;
    });

    const aggregatedList = Object.values(aggregatedMap);
    if (aggregatedList.length === 0) return [];

    // 2. Mapeo de nombres de familias padre
    const parentMap: Record<string, string> = {};
    aggregatedList.forEach(agg => {
        if (agg.parent_id) {
            const parentProd = catalogProducts[agg.parent_id];
            if (parentProd?.name) parentMap[agg.parent_id] = parentProd.name;
        }
    });

    // 3. Agrupar por familia (parent_id || product_id) para consumo secuencial de inventario
    const familyGroups: Record<string, typeof aggregatedList> = {};
    aggregatedList.forEach(item => {
        const familyKey = item.parent_id || item.product_id;
        if (!familyGroups[familyKey]) familyGroups[familyKey] = [];
        familyGroups[familyKey].push(item);
    });

    const stockRemaining: Record<string, number> = { ...stocks };
    const compiledResults: CompiledNettingItem[] = [];

    // 4. Ejecución del neteo secuencial por familia
    Object.keys(familyGroups).forEach(familyKey => {
        const familyItems = familyGroups[familyKey];

        // Ordenar: Línea estándar base primero (canonical_spec === ''), luego variantes alfabéticamente
        familyItems.sort((a, b) => {
            if (a.canonical_spec === '' && b.canonical_spec !== '') return -1;
            if (a.canonical_spec !== '' && b.canonical_spec === '') return 1;
            return a.canonical_spec.localeCompare(b.canonical_spec);
        });

        // Stock disponible para toda la familia
        let totalFamilyStock = 0;
        const accountedPids = new Set<string>();
        familyItems.forEach(fi => {
            if (!accountedPids.has(fi.product_id)) {
                totalFamilyStock += (stockRemaining[fi.product_id] || 0);
                accountedPids.add(fi.product_id);
            }
        });
        if (familyItems[0]?.parent_id && !accountedPids.has(familyItems[0].parent_id)) {
            totalFamilyStock += (stockRemaining[familyItems[0].parent_id] || 0);
            accountedPids.add(familyItems[0].parent_id);
        }

        let runningStock = totalFamilyStock;

        familyItems.forEach((fi, idx) => {
            const parentName = fi.parent_id ? (parentMap[fi.parent_id] || fi.product_name) : fi.product_name;
            const requested = Math.round(fi.raw_demand_kg * 10) / 10;

            // Stock de seguridad: únicamente amortigua la primera línea (línea base estándar)
            const safety = (idx === 0 && applySafetyStock) ? (fi.min_inventory_level || 0) : 0;
            const grossReq = Math.round((requested + safety) * 10) / 10;

            // Deducir stock disponible
            const appliedStock = Math.min(runningStock, grossReq);
            runningStock = Math.max(0, Math.round((runningStock - appliedStock) * 10) / 10);

            // Meta de compra neta
            const netToBuy = Math.max(0, Math.round((grossReq - appliedStock) * 10) / 10);
            const suggestedWithMerma = Math.round(netToBuy * (1 + mermaFactor) * 10) / 10;

            compiledResults.push({
                key: `${fi.product_id}__${fi.canonical_spec}`,
                product_id: fi.product_id,
                product_name: fi.product_name,
                parent_id: fi.parent_id,
                parent_name: parentName,
                sublist: fi.sublist,
                unit: fi.unit,
                canonical_spec: fi.canonical_spec,
                raw_demand_kg: requested,
                safety_stock: safety,
                gross_requirement: grossReq,
                applied_stock: appliedStock,
                remaining_stock: runningStock,
                net_to_buy: netToBuy,
                suggested_with_merma: suggestedWithMerma,
                order_count: fi.order_count,
                accounting_id: fi.accounting_id ?? null
            });
        });
    });

    // 5. Ordenamiento canónico: sublista primero, luego producto padre, nombre y variante
    compiledResults.sort((a, b) => {
        if (a.sublist !== b.sublist) return a.sublist.localeCompare(b.sublist);
        if (a.parent_name !== b.parent_name) return a.parent_name.localeCompare(b.parent_name);
        if (a.product_name !== b.product_name) return a.product_name.localeCompare(b.product_name);
        return a.canonical_spec.localeCompare(b.canonical_spec);
    });

    return compiledResults;
}
