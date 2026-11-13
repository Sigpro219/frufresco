/**
 * Motor Headless de Procesamiento y Homologación de Planillas Físicas de Bodega
 * Cumple con SPEC.md Escenarios 391 y 392 (SDD v1.9.370) — Límite estricto <= 250 líneas.
 * Regla de Oro en Entrada/: Unidad de Compra Directa (Kg o Unidad), CERO RECÁLCULOS mayoristas.
 */

export type PhysicalSheetType = 'entrada' | 'inv_manual' | 'desperdicio' | 'pedidos_desperdicio' | 'donaciones';
export type TargetBalanceColumn = 'G' | 'T' | 'Q' | 'R' | 'X';
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
  wasteQtyKg?: number | null;
  garbageQtyKg?: number | null;
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
  brocoly: 'brocoli', zukiny: 'zukini', zuquini: 'zukini',
  habichuelin: 'habichuela', ceboll: 'cebolla', yerbabuena: 'hierbabuena', huevos: 'cubeta huevos'
};

export function cleanPhysicalSheetProductName(rawName: string): string {
  return String(rawName || '').trim().replace(/^\d+\s*[-.]\s*/, '').trim();
}

export function normalizeProductToken(input: string): string {
  if (!input) return '';
  let clean = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  Object.entries(SYNONYM_MAP).forEach(([wrong, right]) => {
    clean = clean.replace(new RegExp(`\\b${wrong}\\b`, 'g'), right);
  });
  return clean;
}

export function parseHandwrittenQuantity(rawText: string | number | null | undefined, _rawPresentation?: string | null): number {
  if (rawText === null || rawText === undefined) return 0;
  if (typeof rawText === 'number') return Number.isFinite(rawText) && rawText > 0 ? Math.round(rawText * 100) / 100 : 0;
  const str = String(rawText).trim();
  if (!str || /^[-—–_/\s]+$/.test(str)) return 0;
  const expr = str
    .replace(/,/g, '.')
    .replace(/(\d+)\s+1\/2\b/g, '$1.5').replace(/\b1\/2\b/g, '0.5')
    .replace(/(\d+)\s+1\/4\b/g, '$1.25').replace(/\b1\/4\b/g, '0.25')
    .replace(/(\d+)\s+3\/4\b/g, '$1.75').replace(/\b3\/4\b/g, '0.75')
    .replace(/[^0-9.+]/g, '');
  const parts = expr.split('+').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n) && n > 0);
  const numericSum = parts.length > 0 ? parts.reduce((acc, v) => acc + v, 0) : 0;
  return numericSum > 0 ? Math.round(numericSum * 100) / 100 : 0;
}

export interface RawGeminiItemInput {
  rawProductName?: string | null;
  rawQuantityText?: string | number | null;
  quantityKg?: number | string | null;
  wasteQtyKg?: number | string | null;
  garbageQtyKg?: number | string | null;
  rawPresentation?: string | null;
  unitCostPaid?: number | null;
  supplierName?: string | null;
  wasteTypeHint?: 'damage' | 'cleaning' | null;
  sourceNote?: string | null;
}

export function normalizeGeminiItems(rawItems: RawGeminiItemInput[]): RawExtractedSheetRow[] {
  return (rawItems || [])
    .map(it => {
      const rawQtyStr = String(it.rawQuantityText ?? '').trim();
      const isExplicitDash = rawQtyStr.length > 0 && /^[-—–_/]+$/.test(rawQtyStr);
      const parsedFromText = isExplicitDash ? 0 : parseHandwrittenQuantity(rawQtyStr || null, it.rawPresentation ?? null);
      const rawNumericQty = parseHandwrittenQuantity(it.quantityKg);
      const parsedQty = isExplicitDash ? 0 : parsedFromText > 0 ? parsedFromText : rawNumericQty;
      const wasteQty = isExplicitDash ? 0 : parseHandwrittenQuantity(it.wasteQtyKg);
      const garbageQty = isExplicitDash ? 0 : parseHandwrittenQuantity(it.garbageQtyKg);
      const finalQty = parsedQty > 0 ? parsedQty : Math.round((wasteQty + garbageQty) * 100) / 100;
      const resolvedRawText = isExplicitDash
        ? '0'
        : rawQtyStr.length > 0
        ? rawQtyStr
        : wasteQty > 0 || garbageQty > 0
        ? `Desp:${wasteQty} / Bas:${garbageQty}`
        : String(finalQty);
      return {
        rawProductName: cleanPhysicalSheetProductName(it.rawProductName || ''),
        rawQuantityText: resolvedRawText,
        quantityKg: finalQty,
        wasteQtyKg: wasteQty > 0 ? wasteQty : null,
        garbageQtyKg: garbageQty > 0 ? garbageQty : null,
        rawPresentation: it.rawPresentation ?? null,
        unitCostPaid: typeof it.unitCostPaid === 'number' ? it.unitCostPaid : null,
        supplierName: it.supplierName ?? null,
        wasteTypeHint: it.wasteTypeHint === 'cleaning' || it.wasteTypeHint === 'damage' ? it.wasteTypeHint : null,
        sourceNote: it.sourceNote ?? null
      };
    })
    .filter(r => r.rawProductName.length > 0 && r.quantityKg >= 0);
}

export function classifyWasteTargetColumn(rawProductName: string, wasteTypeHint?: 'damage' | 'cleaning' | null): 'Q' | 'R' {
  if (wasteTypeHint === 'cleaning') return 'R';
  if (wasteTypeHint === 'damage') return 'Q';
  const normalized = normalizeProductToken(rawProductName);
  const tokens = normalized.split(' ');
  return CLEANING_KEYWORDS.some(kw => tokens.includes(kw) || normalized.includes(kw)) ? 'R' : 'Q';
}

export function extractCoreProductNameForMatch(rawProductName: string): string {
  const norm = normalizeProductToken(rawProductName);
  const words = norm.split(' ').filter(w => Boolean(w) && (!CLEANING_KEYWORDS.includes(w) || w === 'pelada') && !NOISE_WORDS.includes(w));
  const res = words.join(' ').trim();
  if (res === 'cebolla roja') return 'cebolla cabezona roja';
  if (res === 'cebolla blanca') return 'cebolla cabezona blanca';
  return res || norm;
}

const CANONICAL_NAME_TO_ACCOUNTING_ID: Record<string, number> = {
  'sal': 866,
  'arandano mediano': 90,
  'cubeta huevos tipo a a x 30 unds': 663,
  'cubeta huevos tipo a a x 30 unds.': 663,
  'ahuyma zacata': 92,
  'calabazin verde': 15,
  'germinados x 100 gr': 1104,
};

export function matchProductAgainstCatalog(rawProductName: string, catalog: CatalogProductOption[]): { product: CatalogProductOption | null; confidence: number } {
  if (!rawProductName || catalog.length === 0) return { product: null, confidence: 0 };
  const fullNorm = normalizeProductToken(rawProductName);
  const coreNorm = extractCoreProductNameForMatch(rawProductName);

  // 1. Prioridad absoluta por #ID (accounting_id) explícito o alias canónico SDD
  const idMatch = rawProductName.match(/#(\d{1,6})\b/);
  const explicitId = idMatch ? parseInt(idMatch[1], 10) : (CANONICAL_NAME_TO_ACCOUNTING_ID[fullNorm] ?? CANONICAL_NAME_TO_ACCOUNTING_ID[coreNorm]);
  if (explicitId) {
    const byId = catalog.find(item => Number(item.accounting_id) === explicitId);
    if (byId) return { product: byId, confidence: 100 };
  }

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
  opsCurrentByProductAndCol: Map<string, { G: number; T: number; Q: number; R: number; X?: number }>
): ReconciledSheetRow[] {
  const result: ReconciledSheetRow[] = [];

  extractedRows.forEach((raw, idx) => {
    const { product, confidence } = matchProductAgainstCatalog(raw.rawProductName, catalog);
    const opsMetrics = product ? opsCurrentByProductAndCol.get(product.id) : undefined;

    const pushRow = (qty: number, targetCol: TargetBalanceColumn, subIdx: string, noteOverride?: string) => {
      const opsVal = opsMetrics ? Number(opsMetrics[targetCol] || 0) : 0;
      const conciliationStatus: ConciliationStatus =
        opsVal <= 0.001 ? 'new_entry' : Math.abs(opsVal - qty) <= 0.05 ? 'matched_ops' : 'discrepancy';
      const cleanedRawQtyText =
        raw.rawQuantityText && !/^[-—–_/\s]+$/.test(raw.rawQuantityText.trim()) ? raw.rawQuantityText.trim() : String(qty);
      result.push({
        rowId: `${sourceFileName}-${idx}-${subIdx}-${Date.now()}`,
        sourceFileName,
        rawProductName: raw.rawProductName || 'Producto sin nombre',
        rawQuantityText: cleanedRawQtyText,
        quantity: qty,
        rawPresentation: raw.rawPresentation || '',
        unitCostPaid: raw.unitCostPaid && raw.unitCostPaid > 0 ? raw.unitCostPaid : null,
        supplierName: raw.supplierName || '',
        sourceNote: noteOverride ?? (raw.sourceNote || ''),
        matchedProductId: product?.id || null,
        matchedProductName: product?.name || 'Sin homologar — Seleccionar SKU',
        matchedAccountingId: String(product?.accounting_id ?? product?.sku ?? 'S/N'),
        matchedUnit: product?.unit_of_measure || 'Kg',
        confidence,
        targetColumn: targetCol,
        opsCurrentValue: Math.round(opsVal * 100) / 100,
        conciliationStatus,
        resolution: 'use_sheet',
        selected: Boolean(product?.id) && qty > 0
      });
    };

    if (sheetType === 'pedidos_desperdicio') {
      const wQty = raw.wasteQtyKg && raw.wasteQtyKg > 0 ? raw.wasteQtyKg : 0;
      const gQty = raw.garbageQtyKg && raw.garbageQtyKg > 0 ? raw.garbageQtyKg : 0;
      if (wQty > 0 || gQty > 0) {
        if (wQty > 0) pushRow(wQty, 'Q', 'Q', 'Col 1: Desperdicio');
        if (gQty > 0) pushRow(gQty, 'R', 'R', 'Col 2: Basura / Merma');
      } else {
        const fallbackQty = raw.quantityKg > 0 ? raw.quantityKg : parseHandwrittenQuantity(raw.rawQuantityText, raw.rawPresentation);
        const targetCol = classifyWasteTargetColumn(raw.rawProductName, raw.wasteTypeHint);
        pushRow(fallbackQty, targetCol, targetCol, targetCol === 'R' ? 'Col 2: Basura / Merma' : 'Col 1: Desperdicio');
      }
      return;
    }

    const qty = raw.quantityKg > 0 ? raw.quantityKg : parseHandwrittenQuantity(raw.rawQuantityText, raw.rawPresentation);
    const targetColumn: TargetBalanceColumn =
      sheetType === 'entrada' ? 'G' : sheetType === 'inv_manual' ? 'T' : sheetType === 'donaciones' ? 'X' : classifyWasteTargetColumn(raw.rawProductName, raw.wasteTypeHint);
    if (qty > 0 || raw.rawProductName.trim().length > 0) pushRow(qty, targetColumn, '0');
  });

  return result;
}
