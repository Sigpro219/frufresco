/**
 * Fuente Única de Verdad para las 12 Células Operativas de Alistamiento (Gemba)
 * y la Fecha Operativa Nocturna (Corte 8:00 PM América/Bogotá).
 * Alineado 1:1 con src/app/admin/orders/alistamiento-print/page.tsx (SDD Escenario 468).
 */

export const OPERATIONAL_CELLS = [
    '1. ALISTA SECO PAPAS',
    '2. ALISTA SECO PLATANOS',
    '3. ALISTA SECO TOMATE',
    '5. HIERBAS Y VEGETALES',
    '6. FRUTAS Y OTROS',
    '7. FRESAS Y MORA',
    '8. AGUACATES',
    '10. PROCESADOS',
    '11. LACTEOS CARNES FRIAS',
    '12. HORTALIZAS SELECCIONADAS',
    '14. FRUTA BAJA DEMANDA',
    '15. LECHUGA BATAVIA'
] as const;

export const FALLBACK_CELL = '99. GENERAL / SIN CÉLULA';

const CATEGORY_TO_DEFAULT_CELL: Record<string, string> = {
    TU: '1. ALISTA SECO PAPAS',
    VE: '5. HIERBAS Y VEGETALES',
    HO: '12. HORTALIZAS SELECCIONADAS',
    FR: '6. FRUTAS Y OTROS',
    LA: '11. LACTEOS CARNES FRIAS',
    CP: '11. LACTEOS CARNES FRIAS',
    CO: '11. LACTEOS CARNES FRIAS',
    PR: '10. PROCESADOS',
    DE: '11. LACTEOS CARNES FRIAS',
};

/**
 * Normaliza el nombre de célula a partir de products.buying_team (1:1 con Sábana de Alistamiento)
 * con fallback determinista por código de categoría si buying_team está vacío.
 */
export function normalizeOperationalCell(buyingTeam?: string | null, categoryCode?: string | null): string {
    const clean = (buyingTeam || '').trim();
    if (clean) {
        const exact = OPERATIONAL_CELLS.find(c => c.toLowerCase() === clean.toLowerCase());
        if (exact) return exact;
        const partial = OPERATIONAL_CELLS.find(c =>
            clean.toLowerCase().includes(c.toLowerCase()) ||
            c.toLowerCase().includes(clean.toLowerCase())
        );
        if (partial) return partial;
        return clean.toUpperCase();
    }
    const cat = (categoryCode || '').trim().toUpperCase();
    if (cat && CATEGORY_TO_DEFAULT_CELL[cat]) {
        return CATEGORY_TO_DEFAULT_CELL[cat];
    }
    return FALLBACK_CELL;
}

/**
 * Calcula la Fecha Operativa Nocturna en zona horaria America/Bogota (UTC-5):
 * - De 00:00 a (cutoffHour - 1):59 -> entrega de HOY (D)
 * - Desde cutoffHour:00 (por defecto 20:00 / 8:00 PM) -> entrega de MAÑANA (D+1)
 */
export function getOperationalTargetDate(cutoffHour = 20): string {
    const nowUtc = new Date();
    const bogotaNow = new Date(nowUtc.getTime() - 5 * 60 * 60 * 1000);
    const currentHour = bogotaNow.getUTCHours();

    if (currentHour >= cutoffHour) {
        bogotaNow.setUTCDate(bogotaNow.getUTCDate() + 1);
    }

    const y = bogotaNow.getUTCFullYear();
    const m = String(bogotaNow.getUTCMonth() + 1).padStart(2, '0');
    const d = String(bogotaNow.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Normaliza cantidades a unidad física de planta (KG / UN / CJ / DOC)
 * replicando la lógica de alistamiento-print/page.tsx.
 */
export function normalizePickingDisplayQty(
    quantity: number,
    rawUnit?: string | null,
    productUom?: string | null,
    selectedOptions?: Record<string, any> | null,
    variantLabel?: string | null,
    productWeightKg?: number | null
): { kgQty: number; displayQty: string; unitStr: string } {
    const cleanUom = (productUom || '').trim().toLowerCase();
    const cleanRaw = (rawUnit || '').trim().toLowerCase();
    const opts = selectedOptions || {};
    const presText = String(opts['Presentación'] || opts['Presentacion'] || variantLabel || rawUnit || '');

    const fmt = (n: number) => (n % 1 === 0 ? String(n) : Number(n.toFixed(2)).toLocaleString('es-CO'));

    if (cleanUom === 'unidad' || cleanUom === 'un' || cleanUom === 'und') {
        return { kgQty: quantity, displayQty: fmt(quantity), unitStr: 'UN' };
    }
    if (cleanUom.includes('caja') || cleanRaw.includes('caja')) {
        return { kgQty: quantity, displayQty: fmt(quantity), unitStr: 'CJ' };
    }
    if (cleanUom.includes('docena') || cleanRaw.includes('docena')) {
        return { kgQty: quantity, displayQty: fmt(quantity), unitStr: 'DOC' };
    }

    let effectiveKg = quantity;
    const origQty = opts._original_qty || opts.original_qty;
    const unitWeightGr = opts._unit_weight_gr || opts.unit_weight_gr;

    if (origQty && unitWeightGr && Number(unitWeightGr) > 0) {
        effectiveKg = Number(origQty) * (Number(unitWeightGr) / 1000);
    } else if (cleanRaw !== 'kg' && cleanRaw !== 'kilo' && cleanRaw !== 'kilogramo') {
        const matchGr = presText.match(/(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos?)\b/i);
        const matchKg = presText.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kilogramos?)\b/i);
        if (matchGr) {
            effectiveKg = quantity * (parseFloat(matchGr[1].replace(',', '.')) / 1000);
        } else if (matchKg) {
            effectiveKg = quantity * parseFloat(matchKg[1].replace(',', '.'));
        } else if (cleanRaw === 'lb' || cleanRaw === 'libra' || cleanRaw === 'libras') {
            effectiveKg = quantity * 0.5;
        } else if (productWeightKg && productWeightKg > 0 && (cleanRaw === 'un' || cleanRaw === 'und' || cleanRaw === 'unidad')) {
            effectiveKg = quantity * productWeightKg;
        }
    }

    return { kgQty: effectiveKg, displayQty: fmt(effectiveKg), unitStr: 'KG' };
}
