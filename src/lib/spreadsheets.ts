/**
 * Centralized Spreadsheet Detector & Format Utilities
 * 
 * Supports Microsoft Excel (.xlsx, .xls, .xlsm, .xlsb),
 * OpenDocument Spreadsheet (.ods, .fods),
 * and delimited formats (.csv, .tsv).
 */

export const SPREADSHEET_EXTENSIONS = new Set([
  'xlsx',
  'xls',
  'ods',
  'csv',
  'tsv',
  'xlsm',
  'xlsb',
  'fods'
]);

/**
 * Returns true if the file name or MIME type represents a spreadsheet or tabular data file.
 * Handles mangled names like "FORMATO.xls_1 (1).ods".
 */
export function isSpreadsheetFile(filename?: string | null, mimeType?: string | null): boolean {
  if (!filename && !mimeType) return false;

  const lowerName = (filename || '').toLowerCase().trim();
  const lowerMime = (mimeType || '').toLowerCase().trim();

  // 1. Direct extension check
  const ext = lowerName.split('.').pop() || '';
  if (SPREADSHEET_EXTENSIONS.has(ext)) return true;

  // 2. Mangled extension or stem check (e.g. .xls_1...ods, .xlsx.backup)
  if (
    lowerName.includes('.xlsx') ||
    lowerName.includes('.xls') ||
    lowerName.includes('.ods') ||
    lowerName.includes('.csv') ||
    lowerName.includes('.xlsm')
  ) {
    return true;
  }

  // 3. MIME type check
  if (
    lowerMime.includes('spreadsheet') ||
    lowerMime.includes('excel') ||
    lowerMime.includes('opendocument') ||
    lowerMime.includes('text/csv') ||
    lowerMime.includes('text/tab-separated-values') ||
    lowerMime === 'application/vnd.oasis.opendocument.spreadsheet' ||
    lowerMime === 'application/vnd.ms-excel' ||
    lowerMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves standard MIME type for spreadsheet files when upstream sends generic octet-stream
 */
export function resolveSpreadsheetMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.ods')) return 'application/vnd.oasis.opendocument.spreadsheet';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.tsv')) return 'text/tab-separated-values';
  if (lower.endsWith('.xlsm')) return 'application/vnd.ms-excel.sheet.macroEnabled.12';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export interface ParsedSpreadsheetRow {
  rowIndex: number;
  isHeader: boolean;
  isMeta: boolean;
  hasQty: boolean;
  qtyVal: number | null;
  nameVal: string;
  unitVal: string;
  pluVal: string;
  cells: string[];
}

export interface ParsedSpreadsheetSheet {
  sheetName: string;
  activeCols: number[];
  headerRowIdx: number;
  qtyCol: number;
  nameCol: number;
  unitCol: number;
  pluCol: number;
  countWithQty: number;
  totalRows: number;
  rows: ParsedSpreadsheetRow[];
}

export interface ProgrammaticSpreadsheetItem {
  originalName: string;
  quantity: number;
  unit: string;
  observations?: string;
  plu?: string;
}

export function parseQuantityCell(val: any): { qty: number | null; note?: string } {
  if (val === null || val === undefined) return { qty: null };
  if (typeof val === 'number') {
    // Excel date serial numbers (~year 1995 to 2078)
    if (val >= 35000 && val <= 65000) return { qty: null };
    return val > 0 && val <= 25000 ? { qty: val } : { qty: null };
  }
  const s = String(val).trim();
  if (!s) return { qty: null };

  // Match leading number: "15 muy verde", "2.5", "10 pinton", "0,5"
  const m = s.match(/^([0-9]+(?:[\.,][0-9]+)?)(?:\s*(?:kg|kilos?|g|gr|gramos?|lbs?|libras?|und|unidades?|paquetes?))?(?:\s+(.*))?$/i);
  if (m) {
    const num = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(num) && num > 0 && num <= 25000) {
      if (num >= 35000 && num <= 65000) return { qty: null };
      return { qty: num, note: m[2]?.trim() || undefined };
    }
  }

  const directNum = Number(s.replace(',', '.'));
  if (!isNaN(directNum) && directNum > 0 && directNum <= 25000) {
    if (directNum >= 35000 && directNum <= 65000) return { qty: null };
    return { qty: directNum };
  }
  return { qty: null };
}

/**
 * Universal spreadsheet parser that works across all vendors:
 * Supports spreadsheets with explicit headers (e.g. Colsubsidio)
 * as well as raw sheets with no headers (e.g. El Corral / Titan ODS).
 */
export function parseSpreadsheetWorkbook(
  workbook: any,
  XLSX: any
): { parsedSheets: ParsedSpreadsheetSheet[]; extractedItems: ProgrammaticSpreadsheetItem[] } {
  const parsedSheets: ParsedSpreadsheetSheet[] = [];
  const extractedItems: ProgrammaticSpreadsheetItem[] = [];

  (workbook.SheetNames || []).forEach((sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    const validRows = (rawData || []).filter(row => 
      row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );

    if (validRows.length === 0) return;

    // 1. Detect true header row (requiring at least 2 distinct column header concepts)
    let headerRowIdx = -1;
    let bestHeaderScore = -1;
    for (let r = 0; r < Math.min(15, validRows.length); r++) {
      let score = 0;
      let hasNameKw = false;
      let hasQtyKw = false;
      let hasPluKw = false;
      let hasUnitKw = false;
      const row = validRows[r];
      row.forEach((cell: any) => {
        const s = String(cell || '').toLowerCase().trim();
        if (s.includes('plu') || s.includes('codigo') || s.includes('cod') || s === 'ref' || s === 'id') { score += 3; hasPluKw = true; }
        if (s.includes('descrip') || s.includes('prod') || s.includes('articulo') || s.includes('item') || s === 'nombre') { score += 3; hasNameKw = true; }
        if (s.includes('present') || s.includes('ubm') || s.includes('unidad') || s.includes('medida') || s === 'und') { score += 3; hasUnitKw = true; }
        if (s.includes('cant') || s === 'qty' || s === 'pedido' || s.includes('total') || s.includes('solic') || s.includes('requer')) { score += 3; hasQtyKw = true; }
      });
      if (score >= 6 && ((hasNameKw && hasQtyKw) || (hasPluKw && hasQtyKw) || (hasNameKw && hasPluKw) || (hasUnitKw && hasQtyKw))) {
        if (score > bestHeaderScore) {
          bestHeaderScore = score;
          headerRowIdx = r;
        }
      }
    }

    const maxCols = Math.max(...validRows.map(r => r.length));
    const activeCols: number[] = [];
    for (let c = 0; c < maxCols; c++) {
      for (let r = 0; r < validRows.length; r++) {
        const val = validRows[r][c];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          activeCols.push(c);
          break;
        }
      }
    }

    let nameCol = -1;
    let unitCol = -1;
    let pluCol = -1;
    const qtyCandidates: number[] = [];

    if (headerRowIdx !== -1) {
      const headerRow = validRows[headerRowIdx] || [];
      headerRow.forEach((cellVal: any, colIdx: number) => {
        const s = String(cellVal || '').toLowerCase().trim();
        if (s.includes('plu') || s === 'id' || s.includes('codigo') || s.includes('cod') || s.includes('ref')) {
          pluCol = colIdx;
        } else if (s.includes('present') || s.includes('ubm') || s.includes('unidad') || s.includes('und') || s.includes('medida') || s.includes('uom') || s.includes('empaque')) {
          unitCol = colIdx;
        } else if (s.includes('descrip') || s.includes('prod') || s.includes('articulo') || s.includes('item') || s.includes('nombre')) {
          nameCol = colIdx;
        } else if (s.includes('cant') || s === 'qty' || s === 'pedido' || s.includes('total') || s.includes('solic') || s.includes('requer')) {
          qtyCandidates.push(colIdx);
        }
      });
    }

    // Always scan columns by data distribution to verify or find nameCol and qtyCol
    const dataStart = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
    let bestTextCount = -1;
    let bestNameScanCol = -1;
    let bestNumCount = -1;
    let bestQtyScanCol = -1;

    activeCols.forEach(colIdx => {
      let textCount = 0;
      let numCount = 0;
      for (let r = dataStart; r < validRows.length; r++) {
        const val = validRows[r]?.[colIdx];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const s = String(val).trim();
          const { qty } = parseQuantityCell(val);
          if (qty !== null) {
            numCount++;
          } else if (/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(s) && s.length > 2) {
            textCount++;
          }
        }
      }
      if (textCount > bestTextCount) {
        bestTextCount = textCount;
        bestNameScanCol = colIdx;
      }
      if (numCount > bestNumCount) {
        bestNumCount = numCount;
        bestQtyScanCol = colIdx;
      }
    });

    if (nameCol === -1 || (headerRowIdx === -1 && bestNameScanCol !== -1)) {
      nameCol = bestNameScanCol;
    }

    // For qtyCol: if there is a 'total' column in header, prioritize it!
    let qtyCol = -1;
    if (headerRowIdx !== -1) {
      const headerRow = validRows[headerRowIdx] || [];
      const totalIdx = headerRow.findIndex((c: any) => String(c || '').toLowerCase().includes('total'));
      if (totalIdx !== -1) {
        qtyCol = totalIdx;
      }
    }
    if (qtyCol === -1) {
      if (qtyCandidates.length > 0) {
        qtyCol = qtyCandidates[qtyCandidates.length - 1];
      } else if (bestQtyScanCol !== -1 && bestQtyScanCol !== nameCol) {
        qtyCol = bestQtyScanCol;
      }
    }
    if (qtyCol !== -1 && !qtyCandidates.includes(qtyCol)) {
      qtyCandidates.push(qtyCol);
    }

    const parsedRows: ParsedSpreadsheetRow[] = validRows.map((row, rIdx) => {
      const isHeader = headerRowIdx !== -1 && rIdx === headerRowIdx;
      const isMeta = headerRowIdx !== -1 && rIdx < headerRowIdx;

      let qtyNum: number | null = null;
      let rowNote: string | undefined = undefined;

      if (!isHeader && !isMeta) {
        if (qtyCol !== -1 && row[qtyCol] !== undefined && row[qtyCol] !== null) {
          const { qty, note } = parseQuantityCell(row[qtyCol]);
          if (qty !== null) {
            qtyNum = qty;
            rowNote = note;
          }
        }
        if (qtyNum === null) {
          for (const candCol of qtyCandidates) {
            if (candCol === qtyCol) continue;
            const cVal = row[candCol];
            if (cVal !== undefined && cVal !== null && String(cVal).trim() !== '') {
              const { qty, note } = parseQuantityCell(cVal);
              if (qty !== null) {
                qtyNum = qty;
                rowNote = note;
                break;
              }
            }
          }
        }
      }

      let rowName = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
      let rowUnit = unitCol !== -1 ? String(row[unitCol] || '').trim() : '';
      const rowPlu = pluCol !== -1 ? String(row[pluCol] || '').trim() : '';

      // If no explicit unit column, detect unit if attached to product name (e.g. "Albacom gramos", "Tomate Cherry kilo")
      if (!rowUnit && rowName) {
        const trailingUnitMatch = rowName.match(/\s+(kilo|kg|kls?|gramos?|gr|g|libras?|lbs?|unidades?|unds?|paquetes?|atados?)$/i);
        if (trailingUnitMatch) {
          rowUnit = trailingUnitMatch[1];
          rowName = rowName.replace(/\s+(kilo|kg|kls?|gramos?|gr|g|libras?|lbs?|unidades?|unds?|paquetes?|atados?)$/i, '').trim();
        }
      }
      if (!rowUnit) rowUnit = 'Kg';

      const isMetaRowText = ['descripcion', 'descripción', 'fecha', 'plu', 'presentacion', 'presentación'].includes(rowName.toLowerCase());

      const isDateRow = row.some((cell: any) => {
        const s = String(cell || '').toLowerCase();
        return s.includes('fecha') || s.includes('solicitud') || s.includes('entrega');
      });

      return {
        rowIndex: rIdx + 1,
        isHeader,
        isMeta: isMeta || isMetaRowText,
        hasQty: !isMetaRowText && Boolean(rowName) && qtyNum !== null && qtyNum > 0,
        qtyVal: isMetaRowText || !rowName ? null : qtyNum,
        nameVal: isMetaRowText ? '' : rowName,
        unitVal: rowUnit,
        pluVal: rowPlu,
        noteVal: rowNote,
        cells: activeCols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return '';
          const s = String(v).trim();
          const num = Number(s);
          if (!isNaN(num) && (isDateRow || (num >= 35000 && num <= 60000 && Number.isInteger(num)))) {
            try {
              const utc_days = Math.floor(num - 25569);
              const utc_value = utc_days * 86400;
              const date_info = new Date(utc_value * 1000);
              const day = String(date_info.getUTCDate()).padStart(2, '0');
              const month = String(date_info.getUTCMonth() + 1).padStart(2, '0');
              const year = date_info.getUTCFullYear();
              if (year >= 2020 && year <= 2035) {
                return `${day}/${month}/${year}`;
              }
            } catch {}
          }
          return s;
        })
      };
    });

    const countWithQty = parsedRows.filter(r => r.hasQty).length;

    parsedSheets.push({
      sheetName,
      activeCols,
      headerRowIdx,
      qtyCol: qtyCol !== -1 ? qtyCol : 0,
      nameCol,
      unitCol,
      pluCol,
      countWithQty,
      totalRows: parsedRows.filter(r => !r.isHeader && !r.isMeta).length,
      rows: parsedRows
    });

    parsedRows.forEach(r => {
      if (r.hasQty && r.nameVal && r.qtyVal) {
        const obsParts = [r.pluVal ? `PLU: ${r.pluVal}` : '', r.noteVal || ''].filter(Boolean);
        extractedItems.push({
          originalName: r.nameVal,
          quantity: r.qtyVal,
          unit: r.unitVal || 'Kg',
          observations: obsParts.join(' | '),
          plu: r.pluVal || undefined
        });
      }
    });
  });

  return { parsedSheets, extractedItems };
}
