/**
 * Motor Headless de Procesamiento y Homologación de Planillas Físicas de Bodega
 * Cumple con SPEC.md Escenario 391 y 392 (SDD v1.9.369) — Límite estricto <= 250 líneas.
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
  confidence: number;
  targetColumn: TargetBalanceColumn;
  opsCurrentValue: number;
  conciliationStatus: ConciliationStatus;
  resolution: ArbitrationResolution;
  selected: boolean;
}

const CLEANING_KEYWORDS = [
  'cascara', 'cascaras', 'descapote', 'rama', 'ramas', 'hoja', 'hojas',
  'tallo', 'tallos', 'pelada', 'pelado', 'limpieza', 'arreglo', 'corona', 'capote', 'tusa', 'ameros'
];

const NOISE_WORDS = [
  'ingreso', 'hoy', 'inventario', 'cambio', 'en', 'de', 'del', 'la', 'el', 'los', 'las', 'para', 'picados', 'picado'
];

const SYNONYM_MAP: Record<string, string> = {
  brocoly: 'brocoli',
  zukiny: 'zukini',
  zuquini: 'zukini',
  habichuelin: 'habichuela',
  ceboll: 'cebolla',
  yerbabuena: 'hierbabuena',
  huevos: 'cubeta huevos'
};

/** Factores estándar de conversión mayorista de Corabastos a Kilogramos (Escenario 391 §2.4) */
const WHOLESALE_UNIT_FACTORS_KG: Array<{ pattern: RegExp; factorKg: number }> = [
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:bultos?|btos?|bto)\b/i, factorKg: 50 },
  { pattern: /\b1\/2\s*(?:bulto|bto)\b/i, factorKg: 25 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:canastillas?|cajas?|cjs?|cj)\b/i, factorKg: 20 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:arrobas?|arr)\b/i, factorKg: 12.5 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:docenas?|doc)\b/i, factorKg: 10 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:rollos?)\b/i, factorKg: 30 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:bolsas?)\b/i, factorKg: 20 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:atados?|at)\b/i, factorKg: 1 },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(?:libras?|lb)\b/i, factorKg: 0.5 }
];

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
    clean = clean.replace(new RegExp(`\\b${wrong}\\b`, 'g'), right);
  });
  return clean;
}

export function parseHandwrittenQuantity(
  rawText: string | number | null | undefined,
  rawPresentation?: string | null
): number {
  if (typeof rawText === 'number' && Number.isFinite(rawText) && rawText > 0) {
    return Math.round(rawText * 100) / 100;
  }
  const combined = `${rawText || ''} ${rawPresentation || ''}`.trim();
  if (!combined) return 0;

  let expr = String(rawText || '')
    .replace(/,/g, '.')
    .replace(/(\d+)\s+1\/2\b/g, '$1.5')
    .replace(/\b1\/2\b/g, '0.5')
    .replace(/(\d+)\s+1\/4\b/g, '$1.25')
    .replace(/\b1\/4\b/g, '0.25')
    .replace(/[^0-9.+]/g, '');

  const parts = expr.split('+').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n) && n > 0);
  if (parts.length > 0) {
    return Math.round(parts.reduce((acc, v) => acc + v, 0) * 100) / 100;
  }

  for (const rule of WHOLESALE_UNIT_FACTORS_KG) {
    const match = combined.match(rule.pattern);
    if (match) {
      const count = match[1] ? parseFloat(match[1].replace(',', '.')) : 1;
      if (Number.isFinite(count) && count > 0) {
        return Math.round(count * rule.factorKg * 100) / 100;
      }
    }
  }
  return 0;
}

export function classifyWasteTargetColumn(
  rawProductName: string,
  wasteTypeHint?: 'damage' | 'cleaning' | null
): 'Q' | 'R' {
  if (wasteTypeHint === 'cleaning') return 'R';
  const normalized = normalizeProductToken(rawProductName);
  const tokens = normalized.split(' ');
  return CLEANING_KEYWORDS.some(kw => tokens.includes(kw) || normalized.includes(kw)) ? 'R' : 'Q';
}

export function extractCoreProductNameForMatch(rawProductName: string): string {
  const norm = normalizeProductToken(rawProductName);
  const words = norm.split(' ').filter(w => {
    if (!w) return false;
    if (CLEANING_KEYWORDS.includes(w) && w !== 'pelada') return false;
    if (NOISE_WORDS.includes(w)) return false;
    return true;
  });
  const res = words.join(' ').trim();
  if (res === 'cebolla roja') return 'cebolla cabezona roja';
  if (res === 'cebolla blanca') return 'cebolla cabezona blanca';
  return res || norm;
}

export function matchProductAgainstCatalog(
  rawProductName: string,
  catalog: CatalogProductOption[]
): { product: CatalogProductOption | null; confidence: number } {
  if (!rawProductName || catalog.length === 0) return { product: null, confidence: 0 };
  const fullNorm = normalizeProductToken(rawProductName);
  const coreNorm = extractCoreProductNameForMatch(rawProductName);
  let bestMatch: CatalogProductOption | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const prodNorm = normalizeProductToken(item.name);
    if (!prodNorm) continue;
    if (prodNorm === fullNorm || prodNorm === coreNorm) return { product: item, confidence: 99 };

    let score = 0;
    if (prodNorm.startsWith(coreNorm) || coreNorm.startsWith(prodNorm)) {
      const ratio = Math.min(prodNorm.length, coreNorm.length) / Math.max(prodNorm.length, coreNorm.length);
      score = Math.round(82 + ratio * 15);
    } else {
      const qTokens = coreNorm.split(' ').filter(Boolean);
      const pTokens = prodNorm.split(' ').filter(Boolean);
      if (qTokens.length > 0 && pTokens.length > 0) {
        let hits = 0;
        qTokens.forEach(qt => {
          if (pTokens.some(pt => pt === qt || (pt.length > 4 && qt.length > 4 && (pt.startsWith(qt) || qt.startsWith(pt))))) hits += 1;
        });
        const cov = (hits / qTokens.length) * 0.65 + (hits / pTokens.length) * 0.35;
        score = Math.round(cov * 85 + (qTokens[0] === pTokens[0] ? 12 : 0));
      }
    }
    if (score > bestScore) {
      bestScore = Math.min(98, score);
      bestMatch = item;
    }
  }
  return bestScore < 45 ? { product: null, confidence: bestScore } : { product: bestMatch, confidence: bestScore };
}

export function buildReconciledSheetRows(
  extractedRows: RawExtractedSheetRow[],
  sheetType: PhysicalSheetType,
  sourceFileName: string,
  catalog: CatalogProductOption[],
  opsCurrentByProductAndCol: Map<string, { G: number; T: number; Q: number; R: number }>
): ReconciledSheetRow[] {
  return extractedRows
    .map((raw, idx) => {
      const qty = raw.quantityKg > 0 ? raw.quantityKg : parseHandwrittenQuantity(raw.rawQuantityText, raw.rawPresentation);
      const { product, confidence } = matchProductAgainstCatalog(raw.rawProductName, catalog);
      const targetColumn: TargetBalanceColumn =
        sheetType === 'entrada' ? 'G' : sheetType === 'inv_manual' ? 'T' : classifyWasteTargetColumn(raw.rawProductName, raw.wasteTypeHint);
      const opsMetrics = product ? opsCurrentByProductAndCol.get(product.id) : undefined;
      const opsVal = opsMetrics ? Number(opsMetrics[targetColumn] || 0) : 0;
      const conciliationStatus: ConciliationStatus =
        opsVal <= 0.001 ? 'new_entry' : Math.abs(opsVal - qty) <= 0.05 ? 'matched_ops' : 'discrepancy';

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
