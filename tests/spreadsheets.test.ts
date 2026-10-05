import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { isSpreadsheetFile, resolveSpreadsheetMimeType } from '../src/lib/spreadsheets';

describe('Spreadsheet Detector & Formats Suite', () => {
  it('correctly detects standard spreadsheet extensions', () => {
    assert.strictEqual(isSpreadsheetFile('orden_compra.xlsx'), true);
    assert.strictEqual(isSpreadsheetFile('pedido.xls'), true);
    assert.strictEqual(isSpreadsheetFile('items.ods'), true);
    assert.strictEqual(isSpreadsheetFile('catalogo.csv'), true);
    assert.strictEqual(isSpreadsheetFile('datos.tsv'), true);
    assert.strictEqual(isSpreadsheetFile('macro.xlsm'), true);
    assert.strictEqual(isSpreadsheetFile('binario.xlsb'), true);
  });

  it('correctly detects mangled filenames from webmail / downloads (El Corral case)', () => {
    // Exact file reported by user in production:
    assert.strictEqual(isSpreadsheetFile('FORMATO SUMINISTROS UNICO.xls_1 (1) (4) (3).ods'), true);
    assert.strictEqual(isSpreadsheetFile('PEDIDO_RESTAURANTE.xls_1'), true);
    assert.strictEqual(isSpreadsheetFile('LISTA_PRECIOS.xlsx.backup'), true);
  });

  it('correctly detects spreadsheet by MIME type even if filename is missing or generic', () => {
    assert.strictEqual(isSpreadsheetFile('adjunto_0.bin', 'application/vnd.oasis.opendocument.spreadsheet'), true);
    assert.strictEqual(isSpreadsheetFile('documento', 'application/vnd.ms-excel'), true);
    assert.strictEqual(isSpreadsheetFile('data', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), true);
    assert.strictEqual(isSpreadsheetFile('export', 'text/csv'), true);
  });

  it('correctly rejects non-spreadsheet documents and images', () => {
    assert.strictEqual(isSpreadsheetFile('factura.pdf', 'application/pdf'), false);
    assert.strictEqual(isSpreadsheetFile('firma.png', 'image/png'), false);
    assert.strictEqual(isSpreadsheetFile('banner.jpg', 'image/jpeg'), false);
    assert.strictEqual(isSpreadsheetFile(null, null), false);
    assert.strictEqual(isSpreadsheetFile('', ''), false);
  });

  it('resolves correct MIME types for spreadsheet upload', () => {
    assert.strictEqual(resolveSpreadsheetMimeType('formato.ods'), 'application/vnd.oasis.opendocument.spreadsheet');
    assert.strictEqual(resolveSpreadsheetMimeType('pedidos.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.strictEqual(resolveSpreadsheetMimeType('pedidos.xls'), 'application/vnd.ms-excel');
    assert.strictEqual(resolveSpreadsheetMimeType('pedidos.csv'), 'text/csv');
  });

  it('SheetJS parses ODS workbook and generates valid CSV for Gemini multimodal text input', () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['ITEM', 'DESCRIPCION', 'CANTIDAD', 'UNIDAD'],
      ['101', 'TOMATE CHONTO', 25, 'KG'],
      ['102', 'LECHUGA BATAVIA', 10, 'UND']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'PEDIDO_EL_CORRAL');

    const odsBuffer = XLSX.write(wb, { bookType: 'ods', type: 'buffer' });
    const parsedWb = XLSX.read(odsBuffer, { type: 'buffer' });

    assert.deepStrictEqual(parsedWb.SheetNames, ['PEDIDO_EL_CORRAL']);
    const csv = XLSX.utils.sheet_to_csv(parsedWb.Sheets['PEDIDO_EL_CORRAL']);
    assert.ok(csv.includes('TOMATE CHONTO'));
    assert.ok(csv.includes('25'));
    assert.ok(csv.includes('LECHUGA BATAVIA'));
  });

  it('parseSpreadsheetWorkbook parses sheets without headers (El Corral ODS pattern)', async () => {
    const { parseSpreadsheetWorkbook } = await import('../src/lib/spreadsheets');
    const wb = XLSX.utils.book_new();
    const wsData = [
      [null, 46299.79],
      ['Albacom gramos', 300],
      ['Aji chivato kilo'],
      ['Banano unidades'],
      ['cebolla cabezona kilo', 40],
      ['Plàtano Verde unidades', '15 muy verde'],
      ['Aguacate papelillo kg', '10 pinton']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'PLANILLA PDV');

    const result = parseSpreadsheetWorkbook(wb, XLSX);
    assert.strictEqual(result.parsedSheets.length, 1);
    const sheet = result.parsedSheets[0];
    assert.strictEqual(sheet.sheetName, 'PLANILLA PDV');
    assert.strictEqual(sheet.nameCol, 0);
    assert.strictEqual(sheet.qtyCol, 1);
    assert.strictEqual(sheet.headerRowIdx, -1);
    assert.strictEqual(sheet.countWithQty, 4); // Albacom, cebolla, platano, aguacate

    assert.strictEqual(result.extractedItems.length, 4);
    assert.strictEqual(result.extractedItems[0].originalName, 'Albacom');
    assert.strictEqual(result.extractedItems[0].quantity, 300);
    assert.strictEqual(result.extractedItems[0].unit, 'gramos');
    
    assert.strictEqual(result.extractedItems[1].originalName, 'cebolla cabezona');
    assert.strictEqual(result.extractedItems[1].quantity, 40);
    assert.strictEqual(result.extractedItems[1].unit, 'kilo');

    assert.strictEqual(result.extractedItems[2].originalName, 'Plàtano Verde');
    assert.strictEqual(result.extractedItems[2].quantity, 15);
    assert.strictEqual(result.extractedItems[2].unit, 'unidades');
    assert.strictEqual(result.extractedItems[2].observations, 'muy verde');

    assert.strictEqual(result.extractedItems[3].originalName, 'Aguacate papelillo');
    assert.strictEqual(result.extractedItems[3].quantity, 10);
    assert.strictEqual(result.extractedItems[3].unit, 'kg');
    assert.strictEqual(result.extractedItems[3].observations, 'pinton');
  });
});
