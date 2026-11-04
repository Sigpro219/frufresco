// Test current normalizeToKg logic
function normalizeToKg(quantity, rawUnit, productUom, selectedOptions, variantLabel, productWeightKg) {
    const cleanUom = (productUom || '').trim().toLowerCase();
    const cleanRaw = (rawUnit || '').trim().toLowerCase();
    const opts = selectedOptions || {};
    const presText = (opts['Presentación'] || opts['Presentacion'] || variantLabel || rawUnit || '');

    const isMasterUnidad = cleanUom === 'unidad' || cleanUom === 'un' || cleanUom === 'und';
    const isMasterCaja = cleanUom.includes('caja') || cleanRaw.includes('caja');
    const isMasterDocena = cleanUom.includes('docena') || cleanRaw.includes('docena');

    if (isMasterUnidad) return { kgQty: quantity, displayQty: quantity.toString(), unitStr: 'UN' };
    if (isMasterCaja) return { kgQty: quantity, displayQty: quantity.toString(), unitStr: 'CJ' };
    if (isMasterDocena) return { kgQty: quantity, displayQty: quantity.toString(), unitStr: 'DOC' };

    let effectiveKg = quantity;

    const origQty = opts._original_qty || opts.original_qty;
    const unitWeightGr = opts._unit_weight_gr || opts.unit_weight_gr;

    if (origQty && unitWeightGr && Number(unitWeightGr) > 0) {
        const calculatedKg = Number(origQty) * (Number(unitWeightGr) / 1000);
        effectiveKg = calculatedKg > 0 ? calculatedKg : quantity;
    } else {
        const isRawAlreadyKg = /^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(cleanRaw);
        const matchGr = typeof presText === 'string' ? presText.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i) : null;
        const matchKg = !matchGr && typeof presText === 'string' ? presText.match(/(?:Unidad(?:es)?|Und|U)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:kg|kilos)/i) : null;

        if (matchGr) {
            const gr = parseFloat(matchGr[1].replace(',', '.'));
            const kgPerUnit = gr / 1000;
            if (!isRawAlreadyKg && (cleanRaw.includes('unidad') || cleanRaw.includes('und') || /unidad|und/i.test(presText))) {
                effectiveKg = quantity * kgPerUnit;
            }
        } else if (matchKg) {
            const kgPerUnit = parseFloat(matchKg[1].replace(',', '.'));
            if (!isRawAlreadyKg && (cleanRaw.includes('unidad') || cleanRaw.includes('und') || /unidad|und/i.test(presText))) {
                effectiveKg = quantity * kgPerUnit;
            }
        } else if (!isRawAlreadyKg && (cleanRaw.includes('unidad') || cleanRaw.includes('und')) && productWeightKg && productWeightKg > 0 && productWeightKg !== 1) {
            effectiveKg = quantity * productWeightKg;
        } else if (cleanRaw.includes('libra') || cleanRaw === 'lb' || cleanRaw === 'lbs') {
            effectiveKg = quantity * 0.5;
        }
    }

    const disp = effectiveKg % 1 === 0 
        ? effectiveKg.toString() 
        : Number(effectiveKg.toFixed(2)).toLocaleString('es-CO');

    return { kgQty: effectiveKg, displayQty: disp, unitStr: 'KG' };
}

// BATEA Order 1041:
const bateaItem = {
  quantity: 2.5,
  rawUnit: "Kg",
  productUom: "Kg",
  selectedOptions: { 'Presentación': 'Unidad 500 gr' },
  variantLabel: "und de 500 gr",
  productWeightKg: 0.5
};

console.log("Current output for Batea:", normalizeToKg(
  bateaItem.quantity,
  bateaItem.rawUnit,
  bateaItem.productUom,
  bateaItem.selectedOptions,
  bateaItem.variantLabel,
  bateaItem.productWeightKg
));
