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
