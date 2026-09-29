/**
 * Utility: productHierarchyUtils.ts
 * 
 * Regla Canónica de Ordenamiento Jerárquico de Calibres Agrícolas (Corabastos / FruFresco)
 * 
 * Jerarquía Universal de Calibres para Variantes Hijas de un Producto Padre:
 * 1. CERO / GRANDE      (Cero, Gruesa, Grande, Jumbo, Extra, Primera, Selecta, o gramaje >= 100g)
 * 2. MEDIANA / LAVADA   (Mediana, Lavada, Parveja, Churrasquera, Segunda, Estándar, o gramaje 50-99g)
 * 3. RICHY / PEQUEÑA    (Richy, Rychy, Pequeña, Mini, Tercera, Menudeo, Corriente, o gramaje < 50g)
 * 4. PROCESADOS         (Pelada, Semi-pelada, En cubos, Picada, Porcionada, etc.)
 * 5. BULTOS / MAYORISTA (Bulto x 50 kg, Saco, Arroba)
 */

export interface CaliberRankInfo {
    primaryRank: number;
    gramScore: number;
    isProcessed: boolean;
    isBulto: boolean;
    normalizedName: string;
}

/**
 * Normaliza una cadena removiendo acentos y convirtiendo a minúsculas
 */
function normalizeText(text: string): string {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * Extrae el peso numérico en gramos si el nombre contiene mención explícita
 * (ej: "x 120 gr", "x80g", "und de 40 grs", "x40gr c/u", "x120gr")
 */
function extractGramaje(normalizedText: string): number | null {
    const match = normalizedText.match(/(?:x\s*|und\s*(?:de\s*)?|pelada\s*x\s*|semi-pelada\s*x\s*)(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)?\b/);
    if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        // Si el valor está entre 1 y 999 gramos es un gramaje unitario
        if (val > 0 && val < 1000) {
            return val;
        }
    }
    return null;
}

/**
 * Calcula el rango jerárquico de un producto según su calibre agrícola y gramaje
 */
export function getCaliberRank(productName: string): CaliberRankInfo {
    const norm = normalizeText(productName);
    const gr = extractGramaje(norm);

    // Detección de Bultos / Mayoristas
    const isBulto = /\b(bulto|saco|arroba)\b/.test(norm);

    // Detección de Procesamiento (pelada, cubos, picada, etc.)
    const isProcessed = /\b(pelada|pelado|semi-pelada|semi-pelado|en cubos|cubos|picada|picado|desgranada|desgranado|porcionada|porcionado|rodajas|tajada)\b/.test(norm);

    // Nivel 1: Cero / Grande / Gruesa / Jumbo / Extra / Primera (o gramaje >= 100g)
    const isCeroOrGrande = /\b(cero|grande|gruesa|grueso|jumbo|extra|primera|selecta)\b/.test(norm) || (gr !== null && gr >= 100);

    // Nivel 3: Richy / Pequeña / Mini / Menudeo (o gramaje < 50g)
    const isRichyOrPequena = /\b(richy|rychy|pequena|pequeno|mini|tercera|menudeo|corriente)\b/.test(norm) || (gr !== null && gr < 50);

    // Nivel 2: Mediana / Lavada / Parveja / Estándar / Churrasquera (o gramaje 50g-99g)
    const isMedianaOrLavada = /\b(mediana|mediano|lavada|lavado|parveja|segunda|churrasquera|estandar|institucional)\b/.test(norm) || (gr !== null && gr >= 50 && gr < 100);

    let primaryRank = 40; // Default: Procesado o variante no clasificada

    if (isBulto) {
        primaryRank = 90;
    } else if (isCeroOrGrande) {
        primaryRank = 10;
    } else if (isMedianaOrLavada) {
        primaryRank = 20;
    } else if (isRichyOrPequena) {
        primaryRank = 30;
    } else if (isProcessed) {
        primaryRank = 50;
    }

    // Puntaje de gramaje: mayor gramaje tiene menor puntuación (ordena primero)
    const gramScore = gr !== null ? (1000 - gr) : 500;

    return {
        primaryRank,
        gramScore,
        isProcessed,
        isBulto,
        normalizedName: norm
    };
}

/**
 * Función comparadora universal para dos productos hijos / variantes
 * Aplica:
 * 1. primaryRank (Cero/Grande: 10 < Mediana/Lavada: 20 < Richy/Pequeña: 30 < Procesados: 40/50 < Bultos: 90)
 * 2. Enteros antes que procesados (ej: Papa cero entera antes que Papa cero pelada)
 * 3. Gramaje decreciente (120g antes que 80g antes que 40g)
 * 4. Orden alfabético de respaldo
 */
export function compareChildProducts<T extends { name?: string; colD_productName?: string; [key: string]: any }>(a: T, b: T): number {
    const nameA = a.name || a.colD_productName || '';
    const nameB = b.name || b.colD_productName || '';

    const rankA = getCaliberRank(nameA);
    const rankB = getCaliberRank(nameB);

    // 1. Rango primario de calibre
    if (rankA.primaryRank !== rankB.primaryRank) {
        return rankA.primaryRank - rankB.primaryRank;
    }

    // 2. Si ambos están en el mismo rango de calibre, producto entero antes que procesado
    if (rankA.isProcessed !== rankB.isProcessed) {
        return rankA.isProcessed ? 1 : -1;
    }

    // 3. Gramaje decreciente
    if (rankA.gramScore !== rankB.gramScore) {
        return rankA.gramScore - rankB.gramScore;
    }

    // 4. Desempate alfabético
    return nameA.localeCompare(nameB);
}

/**
 * Función comparadora para una lista de productos que pueden pertenecer a diferentes familias
 * 1. Agrupa por familia contigua (alfabéticamente por el nombre del Padre / Familia)
 * 2. El producto matriz base de la familia va de primero
 * 3. Las variantes hijas se ordenan por la jerarquía canónica de calibres (Cero > Mediana > Richy)
 */
export function compareFamilyProducts<T extends { name?: string; colD_productName?: string; familyKey?: string; [key: string]: any }>(a: T, b: T): number {
    const nameA = a.name || a.colD_productName || '';
    const nameB = b.name || b.colD_productName || '';

    const famA = a.familyKey || nameA;
    const famB = b.familyKey || nameB;

    // 1. Criterio Primario: Familia / Producto Padre contiguo
    const famCompare = famA.localeCompare(famB);
    if (famCompare !== 0) return famCompare;

    // 2. Criterio Secundario: El producto base de la familia va de primero
    const normFamA = normalizeText(famA);
    const normNameA = normalizeText(nameA);
    const normFamB = normalizeText(famB);
    const normNameB = normalizeText(nameB);

    const aIsBase = normNameA === normFamA;
    const bIsBase = normNameB === normFamB;

    if (aIsBase && !bIsBase) return -1;
    if (!aIsBase && bIsBase) return 1;

    // 3. Criterio Terciario: Variantes hijas ordenadas por calibre canónico
    return compareChildProducts(a, b);
}
