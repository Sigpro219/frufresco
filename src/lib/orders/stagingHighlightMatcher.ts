/**
 * Escenario 494: Sincronización Visual de Auditoría Lado a Lado (Fondo + Borde + Rastro de Revisadas)
 * Emparejamiento puro 1-a-1 entre los ítems de la tabla derecha y líneas/filas del documento izquierdo.
 */

export interface StagingAuditItemLike {
    key: string;
    label: string;
    quantity?: number | string | null;
    accountingId?: number | string | null;
    productName?: string | null;
}

export interface ExcelAuditRowLike {
    rowIndex: number;
    cells: string[];
    isHeader?: boolean;
    isMeta?: boolean;
    hasQty?: boolean;
    qtyVal?: number | string | null;
}

const STOPWORDS = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'en', 'por', 'para', 'con', 'sin',
    'un', 'una', 'unos', 'unas', 'kg', 'kilo', 'kilos', 'lb', 'libra', 'libras',
    'und', 'unid', 'unidad', 'unidades', 'paq', 'paquete', 'atado', 'atados',
    'bulto', 'bultos', 'canastilla', 'litro', 'litros', 'gr', 'gramos'
]);

export function normalizeAuditText(text: string): string {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.,\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenizeAuditText(text: string): string[] {
    const norm = normalizeAuditText(text);
    if (!norm) return [];
    return norm
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !/^\d+([.,]\d+)?$/.test(t) && !STOPWORDS.has(t));
}

function parseNumericQty(val: number | string | null | undefined): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(String(val).replace(',', '.').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
}

function lineContainsQuantity(rawLine: string, targetQty: number | null): boolean {
    if (targetQty === null) return false;
    const matches = (rawLine || '').match(/\d+(?:[.,]\d+)?/g);
    if (!matches) return false;
    return matches.some((m) => {
        const parsed = Number(m.replace(',', '.'));
        return Number.isFinite(parsed) && Math.abs(parsed - targetQty) < 0.001;
    });
}

function scoreCandidateMatch(
    itemLabel: string,
    itemQty: number | null,
    candidateText: string,
    candidateQty: number | null,
    itemIdx: number,
    totalItems: number,
    candidatePos: number,
    totalCandidates: number
): number {
    const normLabel = normalizeAuditText(itemLabel);
    const normCandidate = normalizeAuditText(candidateText);
    if (!normLabel || !normCandidate) return 0;

    if (normLabel === normCandidate) {
        return 120 + (itemQty !== null && candidateQty !== null && Math.abs(itemQty - candidateQty) < 0.001 ? 15 : 0);
    }

    const labelTokens = tokenizeAuditText(itemLabel);
    const candTokens = tokenizeAuditText(candidateText);
    if (labelTokens.length === 0 || candTokens.length === 0) {
        return normCandidate.includes(normLabel) ? 45 : 0;
    }

    const candSet = new Set(candTokens);
    let matchedCount = 0;
    for (const tok of labelTokens) {
        if (candSet.has(tok) || candTokens.some((ct) => ct.includes(tok) || tok.includes(ct))) {
            matchedCount++;
        }
    }

    if (matchedCount === 0) return 0;

    const labelRecall = matchedCount / labelTokens.length;
    const candPrecision = matchedCount / candTokens.length;

    let score = 0;
    if (matchedCount === labelTokens.length) {
        score = 60 + Math.round(candPrecision * 30);
    } else {
        score = Math.round(labelRecall * 40 + candPrecision * 15);
    }

    if (score < 22) return 0;

    if (itemQty !== null) {
        if (candidateQty !== null && Math.abs(itemQty - candidateQty) < 0.001) {
            score += 15;
        } else if (lineContainsQuantity(candidateText, itemQty)) {
            score += 12;
        }
    }

    if (totalItems > 1 && totalCandidates > 1) {
        const expectedPos = (itemIdx / totalItems) * totalCandidates;
        const dist = Math.abs(candidatePos - expectedPos);
        if (dist <= 2) score += 5;
        else if (dist <= 5) score += 2;
    }

    return score;
}

export function matchItemsToTextLines(
    items: StagingAuditItemLike[],
    rawText: string
): {
    itemKeyToLineIndex: Map<string, number>;
    lineIndexToItemKey: Map<number, string>;
} {
    const itemKeyToLineIndex = new Map<string, number>();
    const lineIndexToItemKey = new Map<number, string>();
    if (!rawText || items.length === 0) return { itemKeyToLineIndex, lineIndexToItemKey };

    const lines = rawText.split('\n');
    const eligibleLines: Array<{ lineIndex: number; text: string }> = [];
    for (let i = 0; i < lines.length; i++) {
        const stripped = normalizeAuditText(lines[i]).replace(/\s+/g, '');
        if (stripped.length >= 2) {
            eligibleLines.push({ lineIndex: i, text: lines[i] });
        }
    }

    const usedLines = new Set<number>();
    const pairs: Array<{ itemKey: string; lineIndex: number; score: number }> = [];

    items.forEach((item, idx) => {
        const label = item.label || item.productName || '';
        const qty = parseNumericQty(item.quantity);
        if (!label.trim()) return;

        eligibleLines.forEach((cand, candPos) => {
            const s = scoreCandidateMatch(
                label,
                qty,
                cand.text,
                null,
                idx,
                items.length,
                candPos,
                eligibleLines.length
            );
            if (s >= 22) {
                pairs.push({ itemKey: item.key, lineIndex: cand.lineIndex, score: s });
            }
        });
    });

    pairs.sort((a, b) => b.score - a.score);
    for (const p of pairs) {
        if (itemKeyToLineIndex.has(p.itemKey) || usedLines.has(p.lineIndex)) continue;
        itemKeyToLineIndex.set(p.itemKey, p.lineIndex);
        lineIndexToItemKey.set(p.lineIndex, p.itemKey);
        usedLines.add(p.lineIndex);
    }

    return { itemKeyToLineIndex, lineIndexToItemKey };
}

export function matchItemsToExcelRows(
    items: StagingAuditItemLike[],
    rows: ExcelAuditRowLike[]
): {
    itemKeyToRowIndex: Map<string, number>;
    rowIndexToItemKey: Map<number, string>;
} {
    const itemKeyToRowIndex = new Map<string, number>();
    const rowIndexToItemKey = new Map<number, string>();
    if (!rows || rows.length === 0 || items.length === 0) {
        return { itemKeyToRowIndex, rowIndexToItemKey };
    }

    const eligibleRows = rows
        .filter((r) => !r.isHeader && !r.isMeta && Array.isArray(r.cells))
        .map((r) => ({
            rowIndex: r.rowIndex,
            text: r.cells.filter(Boolean).join(' '),
            qtyVal: parseNumericQty(r.qtyVal)
        }))
        .filter((r) => normalizeAuditText(r.text).length >= 2);

    const usedRows = new Set<number>();
    const pairs: Array<{ itemKey: string; rowIndex: number; score: number }> = [];

    items.forEach((item, idx) => {
        const label = item.label || item.productName || '';
        const qty = parseNumericQty(item.quantity);
        if (!label.trim()) return;

        eligibleRows.forEach((cand, candPos) => {
            const s = scoreCandidateMatch(
                label,
                qty,
                cand.text,
                cand.qtyVal,
                idx,
                items.length,
                candPos,
                eligibleRows.length
            );
            if (s >= 22) {
                pairs.push({ itemKey: item.key, rowIndex: cand.rowIndex, score: s });
            }
        });
    });

    pairs.sort((a, b) => b.score - a.score);
    for (const p of pairs) {
        if (itemKeyToRowIndex.has(p.itemKey) || usedRows.has(p.rowIndex)) continue;
        itemKeyToRowIndex.set(p.itemKey, p.rowIndex);
        rowIndexToItemKey.set(p.rowIndex, p.itemKey);
        usedRows.add(p.rowIndex);
    }

    return { itemKeyToRowIndex, rowIndexToItemKey };
}

/**
 * Encapsulated smooth scroll inside a scrollable preview container (never moves window scroll).
 */
export function scrollChildIntoContainer(container: HTMLElement | null, child: HTMLElement | null): void {
    if (!container || !child) return;
    const cRect = container.getBoundingClientRect();
    const elRect = child.getBoundingClientRect();
    const relTop = elRect.top - cRect.top;
    const margin = 44;
    if (relTop >= margin && relTop + elRect.height <= cRect.height - margin) {
        return;
    }
    const targetTop = container.scrollTop + relTop - cRect.height / 2 + elRect.height / 2;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}
