/**
 * Motor Headless de Procesamiento y Homologación de Planillas Físicas de Bodega
 * Cumple con SPEC.md Escenario 391 y 392 (SDD v1.9.369)
 * - Normalización de jerga mayorista de Corabastos (bultos, docenas, atados, fracciones).
 * - Homologación difusa (fuzzy/token) contra el catálogo maestro de 663 SKUs.
 * - Clasificación determinista entre Desperdicio/Avería (Col Q) y Basura/Descapote (Col R).
 * - Arbitraje Anti-Colisión contra registros transaccionales de OPS.
 */

export type PhysicalSheetType = 'entrada' | 'inv_manual' | 'desperdicio';

export type TargetBalanceColumn = 'G' | 'T' | 'Q' | 'R';

export type ConciliationStatus = 'new_entry' | 'matched_ops' | 'discrepancy';

export type ArbitrationResolution = 'use_sheet' | 'keep_ops';

export interface CatalogProductOption {
  id: string;
  name: string;
  sku: string;
  accounting_id: string | null;
  unit_of_measure: string;
  category?: string;
  inventory_group?: string;
  parent_id?: string | null;
}

export interface RawExtractedSheetRow {
  rawProductName: string;
  rawQuantityText?: string;
  quantityKg: number;
  rawPresentation?: string | null;
  unitCostPaid?: number | null;
  supplierName?: string | null;
  wasteTypeHint?: 'damage' | 'cleaning' | null;
  sourceNote?: string | null;
}

export interface ReconciledSheetRow {
  rowId: string;
  sourceFileName: string;
  rawProductName: string;
  rawQuantityText: string;
  quantity: number;
  rawPresentation: string;
  unitCostPaid: number | null;
  supplierName: string;
  sourceNote: string;
  matchedProductId: string | null;
  matchedProductName: string;
  matchedAccountingId: string;
  matchedUnit: string;
  confidence: number; // 0..100
  targetColumn: TargetBalanceColumn;
  opsCurrentValue: number;
  conciliationStatus: ConciliationStatus;
  resolution: ArbitrationResolution;
  selected: boolean;
}

const CLEANING_KEYWORDS = [
  'cascara',
  'cascaras',
  'descapote',
  'rama',
  'ramas',
  'hoja',
  'hojas',
  'tallo',
  'tallos',
  'pelada',
  'pelado',
  'limpieza',
  'arreglo',
  'corona',
  'capote',
  'tusa',
  'ameros'
];

const NOISE_WORDS = [
  'ingreso',
  'hoy',
  'inventario',
  'cambio',
  'en',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'para',
  'picados',
  'picado',
  'maduro',
  'despitonada'
];

const SYNONYM_MAP: Record<string, string> = {
  brocoly: 'brocoli',
  zukiny: 'zukini',
  zuquini: 'zukini',
  habichuelin: 'habichuela',
  ceboll: 'cebolla',
  yerbabuena: 'hierbabuena',
  platano: 'platano',
  huevos: 'cubeta huevos'
};

/**
 * Normaliza un texto removiendo tildes, signos y puntuación para comparación canónica
 */
export function normalizeProductToken(input: string): string {
  if (!input) return '';
  let clean = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  Object.entries(SYNONYM_MAP).forEach(([wrong, right]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, 'g');
    clean = clean.replace(regex, right);
  });

  return clean;
}

/**
 * Evalúa expresiones manuscritas de suma y fracciones de bodega:
 * Ej: "29.1 + 39.4 + 20.5" -> 89, "408 + 70" -> 478, "12 1/2" -> 12.5, "1/2" -> 0.5
 */
export function parseHandwrittenQuantity(rawText: string | number | null | undefined): number {
  if (typeof rawText === 'number') {
    return Number.isFinite(rawText) ? Math.max(0, rawText) : 0;
  }
  if (!rawText) return 0;

  let expr = String(rawText)
    .replace(/,/g, '.')
    .replace(/(\d+)\s+1\/2\b/g, '$1.5')
    .replace(/\b1\/2\b/g, '0.5')
    .replace(/(\d+)\s+1\/4\b/g, '$1.25')
    .replace(/\b1\/4\b/g, '0.25')
    .replace(/[^0-9.+]/g, '');

  if (!expr) return 0;

  const parts = expr.split('+').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n));
  if (parts.length === 0) return 0;
  const total = parts.reduce((acc, val) => acc + val, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Determina si una fila de la planilla de Desperdicio corresponde a
 * Columna R (Basura / Descapote) o Columna Q (Desperdicio / Avería)
 */
export function classifyWasteTargetColumn(
  rawProductName: string,
  wasteTypeHint?: 'damage' | 'cleaning' | null
): 'Q' | 'R' {
  if (wasteTypeHint === 'cleaning') return 'R';
  const normalized = normalizeProductToken(rawProductName);
  const tokens = normalized.split(' ');
  const isCleaning = CLEANING_KEYWORDS.some(kw => tokens.includes(kw) || normalized.includes(kw));
  return isCleaning ? 'R' : 'Q';
}

/**
 * Limpia prefijos de merma o estado (ej. "Cascara Cebolla Roja" -> "Cebolla Roja",
 * "Acelga Ingreso hoy" -> "Acelga") para maximizar el match contra el catálogo maestro.
 */
export function extractCoreProductNameForMatch(rawProductName: string): string {
  const norm = normalizeProductToken(rawProductName);
  const words = norm.split(' ').filter(w => {
    if (!w) return false;
    if (CLEANING_KEYWORDS.includes(w) && w !== 'pelada') return false;
    if (NOISE_WORDS.includes(w) && w !== 'maduro' && w !== 'despitonada') return false;
    return true;
  });

  const result = words.join(' ').trim();
  if (result === 'cebolla roja') return 'cebolla cabezona roja';
  if (result === 'cebolla blanca') return 'cebolla cabezona blanca';
  return result || norm;
}

/**
 * Homologa el nombre extraído en papel contra el catálogo de 663 SKUs activos
 */
export function matchProductAgainstCatalog(
  rawProductName: string,
  catalog: CatalogProductOption[]
): { product: CatalogProductOption | null; confidence: number } {
  if (!rawProductName || catalog.length === 0) {
    return { product: null, confidence: 0 };
  }

  const fullNorm = normalizeProductToken(rawProductName);
  const coreNorm = extractCoreProductNameForMatch(rawProductName);

  let bestMatch: CatalogProductOption | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const prodNorm = normalizeProductToken(item.name);
    if (!prodNorm) continue;

    // 1. Coincidencia exacta
    if (prodNorm === fullNorm || prodNorm === coreNorm) {
      return { product: item, confidence: 99 };
    }

    // 2. Inclusión directa de frase
    let score = 0;
    if (prodNorm.startsWith(coreNorm) || coreNorm.startsWith(prodNorm)) {
      const lenRatio = Math.min(prodNorm.length, coreNorm.length) / Math.max(prodNorm.length, coreNorm.length);
      score = Math.round(82 + lenRatio * 15);
    } else {
      // 3. Similitud por intersección de tokens ponderada (primer token = sustantivo botánico principal)
      const queryTokens = coreNorm.split(' ').filter(Boolean);
      const prodTokens = prodNorm.split(' ').filter(Boolean);

      if (queryTokens.length > 0 && prodTokens.length > 0) {
        let matchedTokens = 0;
        const firstTokenMatches = queryTokens[0] === prodTokens[0];

        queryTokens.forEach(qt => {
          if (prodTokens.some(pt => pt === qt || (pt.length > 4 && qt.length > 4 && (pt.startsWith(qt) || qt.startsWith(pt))))) {
            matchedTokens += 1;
          }
        });

        const coverageQuery = matchedTokens / queryTokens.length;
        const coverageProd = matchedTokens / prodTokens.length;
        const combined = coverageQuery * 0.65 + coverageProd * 0.35;

        score = Math.round(combined * 85 + (firstTokenMatches ? 12 : 0));
      }
    }

    if (score > bestScore) {
      bestScore = Math.min(98, score);
      bestMatch = item;
    }
  }

  if (bestScore < 45) {
    return { product: null, confidence: bestScore };
  }

  return { product: bestMatch, confidence: bestScore };
}

/**
 * Construye las filas reconciliadas de la Mesa de Trabajo cruzando lo extraído por IA
 * contra el catálogo maestro y los valores actuales de OPS para evitar colisiones.
 */
export function buildReconciledSheetRows(
  extractedRows: RawExtractedSheetRow[],
  sheetType: PhysicalSheetType,
  sourceFileName: string,
  catalog: CatalogProductOption[],
  opsCurrentByProductAndCol: Map<string, { G: number; T: number; Q: number; R: number }>
): ReconciledSheetRow[] {
  return extractedRows
    .map((raw, idx) => {
      const qty = raw.quantityKg > 0 ? raw.quantityKg : parseHandwrittenQuantity(raw.rawQuantityText);
      const { product, confidence } = matchProductAgainstCatalog(raw.rawProductName, catalog);

      let targetColumn: TargetBalanceColumn = 'G';
      if (sheetType === 'entrada') {
        targetColumn = 'G';
      } else if (sheetType === 'inv_manual') {
        targetColumn = 'T';
      } else {
        targetColumn = classifyWasteTargetColumn(raw.rawProductName, raw.wasteTypeHint);
      }

      const opsMetrics = product ? opsCurrentByProductAndCol.get(product.id) : undefined;
      const opsVal = opsMetrics ? Number(opsMetrics[targetColumn] || 0) : 0;

      let conciliationStatus: ConciliationStatus = 'new_entry';
      if (opsVal > 0.001) {
        if (Math.abs(opsVal - qty) <= 0.05) {
          conciliationStatus = 'matched_ops';
        } else {
          conciliationStatus = 'discrepancy';
        }
      }

      return {
        rowId: `${sourceFileName}-${idx}-${Date.now()}`,
        sourceFileName,
        rawProductName: raw.rawProductName || 'Producto sin nombre',
        rawQuantityText: raw.rawQuantityText || String(qty),
        quantity: qty,
        rawPresentation: raw.rawPresentation || '',
        unitCostPaid: raw.unitCostPaid && raw.unitCostPaid > 0 ? raw.unitCostPaid : null,
        supplierName: raw.supplierName || '',
        sourceNote: raw.sourceNote || '',
        matchedProductId: product?.id || null,
        matchedProductName: product?.name || 'Sin homologar — Seleccionar SKU',
        matchedAccountingId: product?.accounting_id || product?.sku || 'S/N',
        matchedUnit: product?.unit_of_measure || 'Kg',
        confidence,
        targetColumn,
        opsCurrentValue: Math.round(opsVal * 100) / 100,
        conciliationStatus,
        resolution: 'use_sheet' as ArbitrationResolution,
        selected: qty > 0 && Boolean(product?.id)
      };
    })
    .filter(r => r.quantity > 0 || r.rawProductName.trim().length > 0);
}
