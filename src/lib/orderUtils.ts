
export const getFriendlyOrderId = (order: { created_at: string; sequence_id?: number; id?: string }) => {
    if (!order) return '...';
    
    // Format: DDMM_XXXX
    const date = new Date(order.created_at);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    // Use 4 digits for sequence as requested
    const seq = (order.sequence_id || 0).toString().padStart(4, '0');
    
    return `${day}${month}_${seq}`;
};

/**
 * Sanitizes any physical instruction string to ensure the word "estándar"
 * is strictly eliminated per contract SDD v1.8.5.
 */
export const cleanPhysicalInstruction = (text?: string | null): string | null => {
    if (!text) return null;
    return text
        .replace(/\best[áa]ndar\b\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

export interface DualUnitResult {
    billingQuantity: number;
    billingUnit: string;
    physicalInstruction: string;
    originalQty: number;
    originalUnit: string;
    unitWeightGr: number;
    conversionFactor: number;
}

/**
 * Derives or extracts the canonical physical instruction for an order item.
 * Supports explicit _physical_instruction and provides retroactive heuristics
 * for existing orders with presentation options (e.g. "Unidad 2000 gr").
 */
export const resolvePhysicalInstruction = (item: {
    quantity?: number;
    unit?: string;
    variant_label?: string | null;
    nickname?: string | null;
    selected_options?: Record<string, any> | null;
}): string | null => {
    if (!item) return null;

    // 1. Explicit instruction in selected_options
    const explicit = item.selected_options?._physical_instruction;
    if (explicit && typeof explicit === 'string') {
        return cleanPhysicalInstruction(explicit);
    }

    // 2. Retroactive derivation from selected_options or variant_label
    const opts = item.selected_options || {};
    const presText = (opts['Presentación'] || opts['Presentacion'] || item.variant_label || item.nickname || '') as string;
    if (!presText) return null;

    // Match "Unidad 2000 gr", "Und 800 g", "Bandeja 500 gr", etc.
    const matchGr = presText.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i);
    if (matchGr) {
        const weightGr = parseFloat(matchGr[1].replace(',', '.'));
        const weightKg = weightGr / 1000;
        const currentQty = Number(item.quantity) || 1;
        const currentUnit = (item.unit || 'Kg').toLowerCase();

        let unitCount = 1;
        if (currentUnit.includes('kg') || currentUnit.includes('kilo')) {
            // If quantity is in kg (e.g. 2 Kg of Papaya 2000 gr), calculate units
            unitCount = Math.round(currentQty / weightKg);
            if (unitCount < 1) unitCount = 1;
        } else {
            // Already counted in discrete units
            unitCount = Math.round(currentQty);
        }

        const isBandeja = /bandeja/i.test(presText);
        const noun = isBandeja ? (unitCount === 1 ? 'Bandeja' : 'Bandejas') : (unitCount === 1 ? 'Unidad' : 'Unidades');
        return `${unitCount} ${noun} ${Math.round(weightGr)} gr`;
    }

    // Match "Unidad 2 Kg", "Und 1.5 Kg", etc.
    const matchKg = presText.match(/(?:Unidad(?:es)?|Und|U)\s*(\d+(?:[.,]\d+)?)\s*(?:kg|kilos)/i);
    if (matchKg) {
        const weightKg = parseFloat(matchKg[1].replace(',', '.'));
        const weightGr = Math.round(weightKg * 1000);
        const currentQty = Number(item.quantity) || 1;
        const currentUnit = (item.unit || 'Kg').toLowerCase();

        let unitCount = 1;
        if (currentUnit.includes('kg') || currentUnit.includes('kilo')) {
            unitCount = Math.round(currentQty / weightKg);
            if (unitCount < 1) unitCount = 1;
        } else {
            unitCount = Math.round(currentQty);
        }

        const noun = unitCount === 1 ? 'Unidad' : 'Unidades';
        return `${unitCount} ${noun} ${weightGr} gr`;
    }

    return null;
};

/**
 * Builds canonical dual-unit metadata when an item is selected or modified.
 */
export const buildDualUnitMetadata = (params: {
    quantity: number;
    unit?: string;
    selectedOptions?: Record<string, any> | null;
    product?: { unit_of_measure?: string; weight_kg?: number } | null;
}): DualUnitResult | null => {
    const { quantity, unit = 'Kg', selectedOptions, product } = params;
    if (!quantity || quantity <= 0) return null;

    const opts = selectedOptions || {};
    const presText = (opts['Presentación'] || opts['Presentacion'] || '') as string;
    if (!presText) return null;

    const matchGr = presText.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i);
    const matchKg = !matchGr ? presText.match(/(?:Unidad(?:es)?|Und|U)\s*(\d+(?:[.,]\d+)?)\s*(?:kg|kilos)/i) : null;

    let weightGr = 0;
    let isBandeja = false;

    if (matchGr) {
        weightGr = parseFloat(matchGr[1].replace(',', '.'));
        isBandeja = /bandeja/i.test(presText);
    } else if (matchKg) {
        weightGr = parseFloat(matchKg[1].replace(',', '.')) * 1000;
    } else {
        return null;
    }

    const weightKg = weightGr / 1000;
    const isMasterKg = (product?.unit_of_measure || 'Kg').toLowerCase().includes('kg');
    const inputIsUnit = unit.toLowerCase().includes('un') || unit.toLowerCase().includes('bandeja');

    let discreteQty = quantity;
    let billingKg = quantity;

    if (inputIsUnit || isMasterKg) {
        // User entered discrete count (e.g. 1 unit of Papaya 2000 gr)
        discreteQty = Math.max(1, Math.round(quantity));
        billingKg = Number((discreteQty * weightKg).toFixed(2));
    } else {
        // User entered kg directly (e.g. 2 kg of Papaya 2000 gr)
        discreteQty = Math.round(quantity / weightKg);
        if (discreteQty < 1) discreteQty = 1;
        billingKg = Number(quantity.toFixed(2));
    }

    const noun = isBandeja ? (discreteQty === 1 ? 'Bandeja' : 'Bandejas') : (discreteQty === 1 ? 'Unidad' : 'Unidades');
    const instruction = `${discreteQty} ${noun} ${Math.round(weightGr)} gr`;

    return {
        billingQuantity: billingKg,
        billingUnit: isMasterKg ? (product?.unit_of_measure || 'Kg') : unit,
        physicalInstruction: instruction,
        originalQty: discreteQty,
        originalUnit: isBandeja ? 'Bandeja' : 'Unidad',
        unitWeightGr: Math.round(weightGr),
        conversionFactor: weightKg
    };
};

/**
 * Derives the canonical specification variant key for procurement grouping and picking isolation.
 * Examples: "und de 2 kg; Maduro", "und de 2 kg; Pintón", "und de 550 gr", "Maduro".
 * If no structured specification exists, returns "".
 */
/**
 * Helper to determine if an attribute value is redundant with the product name.
 * e.g., attribute "Maduro" for product "Plátano maduro", or "Verde" for "Plátano verde",
 * or "Blanca" for "Cebolla cabezona blanca".
 */
export const isRedundantAttribute = (attrVal: string, prodName?: string | null): boolean => {
    if (!prodName || !attrVal) return false;
    const cleanAttr = attrVal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const cleanProd = prodName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!cleanAttr || !cleanProd) return false;
    
    // Check if the whole attribute word is already present in the product name
    const regex = new RegExp(`\\b${cleanAttr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    return regex.test(cleanProd);
};

export interface StructuredSpecItemInput {
    quantity?: number;
    unit?: string;
    variant_label?: string | null;
    nickname?: string | null;
    selected_options?: Record<string, any> | null;
    product?: { name?: string | null; [key: string]: any } | null;
    product_name?: string | null;
    productName?: string | null;
}

/**
 * Derives the canonical specification variant key for procurement grouping and picking isolation.
 * Examples: "und de 2 kg; Maduro", "und de 2 kg; Pintón", "und de 550 gr", "Maduro".
 * If no structured specification exists, returns "".
 */
export const getStructuredSpecKey = (item: StructuredSpecItemInput): string => {
    if (!item) return '';

    const prodName = item.product?.name || item.product_name || item.productName || null;
    const opts = item.selected_options || {};
    let unitWeightPart = '';
    const attributeParts: string[] = [];

    // 1. Determine unit presentation weight
    const unitWeightGr = opts._unit_weight_gr || opts.unit_weight_gr;
    if (unitWeightGr && Number(unitWeightGr) > 0) {
        const gr = Number(unitWeightGr);
        const weightStr = gr >= 1000 
            ? ((gr / 1000) % 1 === 0 ? (gr / 1000).toString() : (gr / 1000).toFixed(1)) + ' kg'
            : `${gr} gr`;
        unitWeightPart = `und de ${weightStr}`;
    } else {
        const pres = (opts['Presentación'] || opts['Presentacion'] || item.variant_label || item.nickname || '') as string;
        const matchGr = typeof pres === 'string' ? pres.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i) : null;
        if (matchGr) {
            const gr = parseFloat(matchGr[1].replace(',', '.'));
            const weightStr = gr >= 1000 ? `${gr / 1000} kg` : `${gr} gr`;
            unitWeightPart = `und de ${weightStr}`;
        }
    }

    // 2. Extract valid culinary attributes (Maduración, etc.)
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
};

/**
 * Normaliza y traduce atributos de tamaño/alistamiento a la nomenclatura operativa oficial de bodega:
 * - Grande -> Cero
 * - Mediana / Mediano -> Mediana
 * - Pequeño / Pequeno / Pequeña / Richy -> Richy
 * - Mini -> Mini
 * - Jumbo -> Jumbo
 */
export const normalizePickingNote = (val?: string | null): string | null => {
    if (!val || typeof val !== 'string') return null;
    const clean = val.trim();
    if (!clean) return null;
    const lower = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (lower === 'grande' || lower === 'cero') return 'Cero';
    if (lower === 'mediana' || lower === 'mediano') return 'Mediana';
    if (lower === 'pequeno' || lower === 'pequena' || lower === 'richy') return 'Richy';
    if (lower === 'mini') return 'Mini';
    if (lower === 'jumbo') return 'Jumbo';
    
    return clean;
};

/**
 * Formats the clean structured operational specification:
 * e.g. "12 und de 2 kg; Maduro"
 * Returns null if no structured specification exists (avoids noise).
 * Filters out redundant attributes whose values are already explicit in the product name.
 */
export const formatStructuredSpecification = (item: StructuredSpecItemInput): string | null => {
    if (!item) return null;

    const prodName = item.product?.name || item.product_name || item.productName || null;
    const opts = item.selected_options || {};
    let discretePart: string | null = null;
    const attributeParts: string[] = [];

    // 1. Extract discrete part from explicit _original_qty and _unit_weight_gr
    const origQty = opts._original_qty || opts.original_qty;
    const unitWeightGr = opts._unit_weight_gr || opts.unit_weight_gr;
    const origUnit = (opts._original_unit || opts.original_unit || 'und').toLowerCase();

    if (origQty && unitWeightGr) {
        const noun = origUnit.includes('bandeja') ? 'bandeja' : 'und';
        let weightStr = '';
        if (unitWeightGr >= 1000) {
            const kg = unitWeightGr / 1000;
            weightStr = (kg % 1 === 0 ? kg.toString() : kg.toFixed(1)) + ' kg';
        } else {
            weightStr = `${unitWeightGr} gr`;
        }
        discretePart = `${origQty} ${noun} de ${weightStr}`;
    } else {
        // Fallback: match from Presentación or variant_label like "Unidad 2000 gr"
        const pres = (opts['Presentación'] || opts['Presentacion'] || item.variant_label || item.nickname || '');
        const matchGr = typeof pres === 'string' ? pres.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i) : null;
        if (matchGr) {
            const gr = parseFloat(matchGr[1].replace(',', '.'));
            const kgPerUnit = gr / 1000;
            const currentQty = Number(item.quantity) || 1;
            const currentUnit = (item.unit || 'kg').toLowerCase();
            let count = 1;
            if (currentUnit.includes('kg') || currentUnit.includes('kilo')) {
                count = Math.round(currentQty / kgPerUnit);
                if (count < 1) count = 1;
            } else {
                count = Math.round(currentQty);
            }
            const weightStr = gr >= 1000 ? `${gr / 1000} kg` : `${gr} gr`;
            const isBandeja = /bandeja/i.test(pres);
            discretePart = `${count} ${isBandeja ? 'bandeja' : 'und'} de ${weightStr}`;
        }
    }

    // 2. Extract valid culinary attributes (Maduración, Corte, Calibre, etc.)
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

    // 2.1 Extraer y normalizar Nota de Alistamiento / Tamaño (Mapeo: Grande=Cero, Mediana=Mediana, Pequeño=Richy)
    const pickingKeys = ['Nota alistamiento', 'Nota de alistamiento', 'nota_alistamiento', 'Tamaño', 'Tamano', 'tamano', 'Size'];
    let foundPickingNote = false;
    for (const pk of pickingKeys) {
        if (opts[pk] && typeof opts[pk] === 'string' && opts[pk].trim()) {
            const rawVal = opts[pk].trim();
            const normalized = normalizePickingNote(rawVal);
            if (normalized && !isRedundantAttribute(normalized, prodName)) {
                if (!attributeParts.includes(normalized)) {
                    attributeParts.push(normalized);
                }
                foundPickingNote = true;
                break;
            }
        }
    }

    // 2.2 Fallback: Si no estaba en selected_options, inspeccionar variant_label
    if (!foundPickingNote) {
        const vl = item.variant_label || '';
        if (vl) {
            const match = vl.match(/\b(cero|grande|mediana|mediano|richy|peque[nñ]o|peque[nñ]a|mini|jumbo)\b/i);
            if (match) {
                const normalized = normalizePickingNote(match[1]);
                if (normalized && !isRedundantAttribute(normalized, prodName) && !attributeParts.includes(normalized)) {
                    attributeParts.push(normalized);
                }
            }
        }
    }

    // 3. Assemble
    const attrStr = attributeParts.join(', ');
    if (discretePart && attrStr) {
        return `${discretePart}; ${attrStr}`;
    }
    if (discretePart) {
        return discretePart;
    }
    if (attrStr) {
        return attrStr;
    }
    return null;
};


