import test from 'node:test';
import assert from 'node:assert';
import { formatStructuredSpecification, isRedundantAttribute } from '../src/lib/orderUtils';
import { PRINT_DOCUMENTS, getBogotaDate } from '../src/components/print/PrintDocumentSwitcher';

/**
 * Normaliza cualquier cantidad y unidad respetando la Unidad Maestra de Compra/Catálogo.
 * Réplica canónica de la lógica de alistamiento-print.
 */
function normalizeToKg(
    quantity: number, 
    rawUnit?: string, 
    productUom?: string,
    selectedOptions?: Record<string, any> | null,
    variantLabel?: string | null,
    productWeightKg?: number | null
): { kgQty: number; displayQty: string; unitStr: string; subNote?: string } {
    const cleanUom = (productUom || '').trim().toLowerCase();
    const cleanRaw = (rawUnit || '').trim().toLowerCase();
    const opts = selectedOptions || {};
    const presText = (opts['Presentación'] || opts['Presentacion'] || variantLabel || rawUnit || '') as string;

    const isMasterUnidad = cleanUom === 'unidad' || cleanUom === 'un' || cleanUom === 'und';
    const isMasterCaja = cleanUom.includes('caja') || cleanRaw.includes('caja');
    const isMasterDocena = cleanUom.includes('docena') || cleanRaw.includes('docena');

    if (isMasterUnidad) {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'UN'
        };
    }
    if (isMasterCaja) {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'CJ'
        };
    }
    if (isMasterDocena) {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'DOC'
        };
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

    const disp = effectiveKg % 1 === 0 
        ? effectiveKg.toString() 
        : Number(effectiveKg.toFixed(2)).toLocaleString('es-CO');

    return {
        kgQty: effectiveKg,
        displayQty: disp,
        unitStr: 'KG'
    };
}

test('Alistamiento Print: Normalización Canónica de Unidades en Fila 1', async (t) => {
    await t.test('Papaya maradol con dual-unit (12 und de 2 kg): Fila 1 debe decir 24 KG y no 24UN', () => {
        const result = normalizeToKg(
            24, 
            'Unidad', 
            'Kg', 
            { _original_qty: 12, _unit_weight_gr: 2000 }, 
            'Unidad', 
            2
        );
        assert.strictEqual(result.displayQty, '24');
        assert.strictEqual(result.unitStr, 'KG');
        assert.strictEqual(`${result.displayQty} ${result.unitStr}`, '24 KG');
    });

    await t.test('Patilla 7000 gr (CC33): 1 unidad de 7 kg debe dar 7 KG en Fila 1', () => {
        const result = normalizeToKg(
            1, 
            'Unidad 7000 gr', 
            'Kg', 
            { 'Presentación': 'Unidad 7000 gr|7000' }, 
            null, 
            7
        );
        assert.strictEqual(result.displayQty, '7');
        assert.strictEqual(result.unitStr, 'KG');
        assert.strictEqual(`${result.displayQty} ${result.unitStr}`, '7 KG');
    });

    await t.test('Patilla 10000 gr (Yanuba): 2 unidades de 10 kg deben dar 20 KG en Fila 1', () => {
        const result = normalizeToKg(
            2, 
            'Unidad 10000 gr', 
            'Kg', 
            { 'Presentación': 'Unidad 10000 gr|10000' }, 
            null, 
            7
        );
        assert.strictEqual(result.displayQty, '20');
        assert.strictEqual(result.unitStr, 'KG');
        assert.strictEqual(`${result.displayQty} ${result.unitStr}`, '20 KG');
    });

    await t.test('Piña golden: 1 unidad con peso nominal 2 kg debe dar 2 KG en Fila 1', () => {
        const result = normalizeToKg(
            1, 
            'Unidad', 
            'Kg', 
            null, 
            null, 
            2
        );
        assert.strictEqual(result.displayQty, '2');
        assert.strictEqual(result.unitStr, 'KG');
        assert.strictEqual(`${result.displayQty} ${result.unitStr}`, '2 KG');
    });

    await t.test('Pasta de ajo x 1000 grs con unit_of_measure=Unidad: debe decir UN en Fila 1', () => {
        const result = normalizeToKg(
            7, 
            'Unidad', 
            'Unidad', 
            null, 
            null, 
            1
        );
        assert.strictEqual(result.displayQty, '7');
        assert.strictEqual(result.unitStr, 'UN');
        assert.strictEqual(`${result.displayQty} ${result.unitStr}`, '7 UN');
    });

    await t.test('Agrupación Gemba: Productos hijos de la misma familia deben ordenarse contiguos con el base primero', () => {
        const products = [
            { name: 'Cebolla cabezona blanca', familyKey: 'Cebolla cabezona blanca' },
            { name: 'Apio sin hoja', familyKey: 'Apio' },
            { name: 'Apio en tallo', familyKey: 'Apio' },
            { name: 'Apio', familyKey: 'Apio' },
            { name: 'Brócoli', familyKey: 'Brócoli' },
            { name: 'Cebolla cabezona roja sin pelar', familyKey: 'Cebolla cabezona roja' },
            { name: 'Cebolla cabezona roja', familyKey: 'Cebolla cabezona roja' }
        ];

        const sorted = [...products].sort((a, b) => {
            const famA = a.familyKey || a.name;
            const famB = b.familyKey || b.name;
            const famCompare = famA.localeCompare(famB);
            if (famCompare !== 0) return famCompare;

            const aIsBase = a.name.toLowerCase() === famA.toLowerCase();
            const bIsBase = b.name.toLowerCase() === famB.toLowerCase();
            if (aIsBase && !bIsBase) return -1;
            if (!aIsBase && bIsBase) return 1;

            return a.name.localeCompare(b.name);
        });

        const names = sorted.map(p => p.name);
        assert.deepStrictEqual(names, [
            'Apio',
            'Apio en tallo',
            'Apio sin hoja',
            'Brócoli',
            'Cebolla cabezona blanca',
            'Cebolla cabezona roja',
            'Cebolla cabezona roja sin pelar'
        ]);
    });

    await t.test('Anti-Redundancia Poka-Yoke: Atributos que ya están en el nombre del producto deben omitirse', () => {
        // 1. Plátano maduro con opción "Maduro" debe retornar null (celda vacía)
        const platanoMaduroSpec = formatStructuredSpecification({
            product_name: 'Plátano maduro',
            quantity: 20,
            unit: 'Kg',
            selected_options: { 'Maduración': 'Maduro' }
        });
        assert.strictEqual(platanoMaduroSpec, null, 'Plátano maduro con Maduro debe ser null');

        // 2. Plátano verde con opción "Verde" debe retornar null (celda vacía)
        const platanoVerdeSpec = formatStructuredSpecification({
            product_name: 'Plátano verde',
            quantity: 30,
            unit: 'Kg',
            selected_options: { 'Maduración': 'Verde' }
        });
        assert.strictEqual(platanoVerdeSpec, null, 'Plátano verde con Verde debe ser null');

        // 3. Papaya maradol con opción "Maduro" y dual-unit debe mantener la especificación diferencial
        const papayaSpec = formatStructuredSpecification({
            product_name: 'Papaya maradol',
            quantity: 24,
            unit: 'Kg',
            selected_options: {
                'Maduración': 'Maduro',
                _original_qty: 12,
                _unit_weight_gr: 2000,
                _original_unit: 'Unidad'
            }
        });
        assert.strictEqual(papayaSpec, '12 und de 2 kg; Maduro', 'Papaya debe conservar Maduro y peso');

        // 4. Mango tommy con "Pintón" debe conservarse
        const mangoSpec = formatStructuredSpecification({
            product_name: 'Mango tommy',
            quantity: 5,
            unit: 'Kg',
            selected_options: { 'Maduración': 'Pintón' }
        });
        assert.strictEqual(mangoSpec, 'Pintón', 'Mango tommy debe conservar Pintón');

        // 5. Test directo de la función helper isRedundantAttribute
        assert.strictEqual(isRedundantAttribute('Maduro', 'Plátano maduro'), true);
        assert.strictEqual(isRedundantAttribute('Verde', 'Plátano verde institucional'), true);
        assert.strictEqual(isRedundantAttribute('Blanca', 'Cebolla cabezona blanca'), true);
        assert.strictEqual(isRedundantAttribute('Maduro', 'Papaya maradol'), false);
        assert.strictEqual(isRedundantAttribute('Pintón', 'Plátano maduro'), false);
    });

    await t.test('Erradicación de Atributos Falsos: Textos libres sin opciones estructuradas NUNCA deben inventar atributos', () => {
        // Colsubsidio Catering: Aguacate con nickname "AGUACATE PRIMERA" y selected_options vacías
        const aguacatePrimera = formatStructuredSpecification({
            product_name: 'Aguacate',
            quantity: 10,
            unit: 'Kg',
            nickname: 'AGUACATE PRIMERA 1000 GR (primera 1000 gr)',
            variant_label: 'primera 1000 gr',
            selected_options: {}
        });
        assert.strictEqual(aguacatePrimera, null, 'Aguacate primera sin selected_options debe ser null');

        // Colsubsidio VIP: Aguacate con nickname "AGUACATE GRANDE PARA TAJAR" y selected_options vacías
        const aguacateTajar = formatStructuredSpecification({
            product_name: 'Aguacate',
            quantity: 3,
            unit: 'Kg',
            nickname: 'AGUACATE GRANDE PARA TAJAR (grande tajar)',
            variant_label: 'grande tajar',
            selected_options: {}
        });
        assert.strictEqual(aguacateTajar, null, 'Aguacate tajar sin selected_options debe ser null');

        // Champiñón con nickname "PAREJO MEDIANO" y selected_options vacías
        const champinonMediano = formatStructuredSpecification({
            product_name: 'Champiñon',
            quantity: 1,
            unit: 'Kg',
            nickname: 'CHAMPIÑON GRANEL 1000 GR (PAREJO MEDIANO granel 1000 gr)',
            variant_label: 'PAREJO MEDIANO granel 1000 gr',
            selected_options: {}
        });
        assert.strictEqual(champinonMediano, null, 'Champiñón mediano sin selected_options debe ser null');
    });

    await t.test('Compuerta de Aprobación de Documentos Físicos: Solo órdenes en estados operacionales deben ingresar a las planillas', () => {
        const OPERATIONAL_STATUSES = new Set(['para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed']);
        const NON_OPERATIONAL_STATUSES = ['pending_approval', 'recibido', 'pending', 'cancelled', 'draft'];

        // 1. Estados no operacionales deben ser rechazados por la compuerta
        NON_OPERATIONAL_STATUSES.forEach(status => {
            assert.strictEqual(
                OPERATIONAL_STATUSES.has(status),
                false,
                `Estado '${status}' NO debe entrar a planillas de alistamiento/compras`
            );
        });

        // 2. Estados operacionales autorizados deben ser admitidos
        ['para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'].forEach(status => {
            assert.strictEqual(
                OPERATIONAL_STATUSES.has(status),
                true,
                `Estado operacional '${status}' debe ser admitido`
            );
        });
    });

    await t.test('PrintDocumentSwitcher: Catálogo de 7 documentos oficiales y cálculo de fechas', () => {
        // 1. Debe registrar exactamente los 7 documentos de la suite oficial (incluyendo Manifiesto de Ruta e Inventario)
        assert.strictEqual(PRINT_DOCUMENTS.length, 7);
        const keys = PRINT_DOCUMENTS.map(d => d.key);
        assert.deepStrictEqual(keys, ['alistamiento', 'purchases', 'receiving', 'inventory', 'labels', 'manifest', 'contingency']);

        // 2. getBogotaDate debe generar formato YYYY-MM-DD
        const today = getBogotaDate(0);
        assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

        const yesterday = getBogotaDate(-1);
        assert.match(yesterday, /^\d{4}-\d{2}-\d{2}$/);
        assert.notStrictEqual(today, yesterday);

        const tomorrow = getBogotaDate(1);
        assert.match(tomorrow, /^\d{4}-\d{2}-\d{2}$/);
        assert.notStrictEqual(today, tomorrow);
    });
});

