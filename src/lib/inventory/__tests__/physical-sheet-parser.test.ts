import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReconciledSheetRows,
  cleanPhysicalSheetProductName,
  parseHandwrittenQuantity,
  normalizeGeminiItems
} from '../physical-sheet-parser';
import type {
  CatalogProductOption,
  RawExtractedSheetRow
} from '../physical-sheet-parser';

const MOCK_CATALOG: CatalogProductOption[] = [
  { id: 'prod-91', name: 'Ahuyama', accounting_id: '91', sku: '91', unit_of_measure: 'Kg', category: 'Verdura' },
  { id: 'prod-93', name: 'Ají chiche perro', accounting_id: '1526', sku: '1526', unit_of_measure: 'Kg', category: 'Verdura' },
  { id: 'prod-102', name: 'Ajo importado', accounting_id: '102', sku: '102', unit_of_measure: 'Kg', category: 'Verdura' }
];

test('normalizeGeminiItems preserves numeric quantities when rawQuantityText is omitted (SPEC §8.8.12.3)', () => {
  const normalized = normalizeGeminiItems([
    {
      rawProductName: '1 - Ahuyama',
      quantityKg: 78
    },
    {
      rawProductName: '2 - Ajo Importado',
      wasteQtyKg: 4.5,
      garbageQtyKg: 1.25
    }
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].rawProductName, 'Ahuyama');
  assert.equal(normalized[0].quantityKg, 78);
  assert.equal(normalized[0].rawQuantityText, '78');

  assert.equal(normalized[1].rawProductName, 'Ajo Importado');
  assert.equal(normalized[1].wasteQtyKg, 4.5);
  assert.equal(normalized[1].garbageQtyKg, 1.25);
});

test('normalizeGeminiItems converts explicit horizontal dashes and empty strings to 0 without dropping rows', () => {
  const normalized = normalizeGeminiItems([
    {
      rawProductName: '3 - Ají Chiche Perro',
      rawQuantityText: '—',
      quantityKg: 99
    },
    {
      rawProductName: '4 - Ají Chile Rojo',
      rawQuantityText: '---'
    },
    {
      rawProductName: '8 - Ajo Importado',
      rawQuantityText: '408 + 70'
    }
  ]);

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].rawProductName, 'Ají Chiche Perro');
  assert.equal(normalized[0].quantityKg, 0);
  assert.equal(normalized[0].rawQuantityText, '0');

  assert.equal(normalized[1].quantityKg, 0);
  assert.equal(normalized[2].quantityKg, 478);
});

test('buildReconciledSheetRows marks rows with quantity === 0 or unmatched product as selected: false', () => {
  const opsMap = new Map<string, { G: number; T: number; Q: number; R: number; X?: number }>();
  const rawItems: RawExtractedSheetRow[] = [
    { rawProductName: '1 - Ahuyama', rawQuantityText: '78', quantityKg: 78 },
    { rawProductName: '3 - Ají Chiche Perro', rawQuantityText: '0', quantityKg: 0 },
    { rawProductName: '99 - Producto Inexistente Xyz', rawQuantityText: '15', quantityKg: 15 }
  ];

  const rows = buildReconciledSheetRows(rawItems, 'inv_manual', 'CamScanner.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rows.length, 3);

  // Row 1: Matched & > 0 -> selected: true
  assert.equal(rows[0].matchedProductId, 'prod-91');
  assert.equal(rows[0].quantity, 78);
  assert.equal(rows[0].selected, true);

  // Row 2: Matched & 0 -> selected: false
  assert.equal(rows[1].matchedProductId, 'prod-93');
  assert.equal(rows[1].quantity, 0);
  assert.equal(rows[1].selected, false);

  // Row 3: Unmatched & > 0 -> selected: false
  assert.equal(rows[2].matchedProductId, null);
  assert.equal(rows[2].quantity, 15);
  assert.equal(rows[2].selected, false);
});

test('buildReconciledSheetRows preserves bicolumn semantics and sourceNote for pedidos_desperdicio including 0-quantity rows', () => {
  const opsMap = new Map<string, { G: number; T: number; Q: number; R: number; X?: number }>();
  const rawItems: RawExtractedSheetRow[] = [
    {
      rawProductName: 'Ahuyama',
      rawQuantityText: '3.5 / 1.5',
      quantityKg: 5,
      wasteQtyKg: 3.5,
      garbageQtyKg: 1.5
    },
    {
      rawProductName: 'Ají Chiche Perro',
      rawQuantityText: '0',
      quantityKg: 0,
      wasteQtyKg: 0,
      garbageQtyKg: 0
    }
  ];

  const rows = buildReconciledSheetRows(rawItems, 'pedidos_desperdicio', 'Pedidos.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rows.length, 3);

  assert.equal(rows[0].targetColumn, 'Q');
  assert.equal(rows[0].quantity, 3.5);
  assert.equal(rows[0].sourceNote, 'Col 1: Desperdicio');
  assert.equal(rows[0].selected, true);

  assert.equal(rows[1].targetColumn, 'R');
  assert.equal(rows[1].quantity, 1.5);
  assert.equal(rows[1].sourceNote, 'Col 2: Basura / Merma');
  assert.equal(rows[1].selected, true);

  assert.equal(rows[2].targetColumn, 'Q');
  assert.equal(rows[2].quantity, 0);
  assert.equal(rows[2].sourceNote, 'Col 1: Desperdicio');
  assert.equal(rows[2].selected, false);
});

test('cleanPhysicalSheetProductName and parseHandwrittenQuantity handle dirty Gemba inputs', () => {
  assert.equal(cleanPhysicalSheetProductName('51 - Zanahoria'), 'Zanahoria');
  assert.equal(cleanPhysicalSheetProductName('12. Cebolla Cabezona'), 'Cebolla Cabezona');
  assert.equal(parseHandwrittenQuantity('—'), 0);
  assert.equal(parseHandwrittenQuantity('8,50'), 8.5);
  assert.equal(parseHandwrittenQuantity('10 + 5.5'), 15.5);
});

test('buildReconciledSheetRows maps all 5 physical sheet types to their exact target columns (G, T, Q, R, X)', () => {
  const opsMap = new Map<string, { G: number; T: number; Q: number; R: number; X?: number }>();
  const sampleItem: RawExtractedSheetRow[] = [
    { rawProductName: 'Ahuyama', rawQuantityText: '25', quantityKg: 25 }
  ];
  const cleaningItem: RawExtractedSheetRow[] = [
    { rawProductName: 'Ahuyama descapote cáscara', rawQuantityText: '4', quantityKg: 4, wasteTypeHint: 'cleaning' }
  ];

  // 1. Entradas Muelle -> Col G
  const rowsG = buildReconciledSheetRows(sampleItem, 'entrada', 'Muelle.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rowsG[0].targetColumn, 'G');

  // 2. Conteo Fin Turno -> Col T
  const rowsT = buildReconciledSheetRows(sampleItem, 'inv_manual', 'Conteo.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rowsT[0].targetColumn, 'T');

  // 3. Formato Pedidos (2 Cols) -> Col Q (Desperdicio) & Col R (Basura)
  const rowsQR = buildReconciledSheetRows(
    [{ rawProductName: 'Ahuyama', quantityKg: 6, wasteQtyKg: 4, garbageQtyKg: 2 }],
    'pedidos_desperdicio',
    'Pedidos.pdf',
    MOCK_CATALOG,
    opsMap
  );
  assert.equal(rowsQR[0].targetColumn, 'Q');
  assert.equal(rowsQR[1].targetColumn, 'R');

  // 4. Desperdicio General -> Col Q (avería) & Col R (descapote/cáscara)
  const rowsDespQ = buildReconciledSheetRows(sampleItem, 'desperdicio', 'Desp.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rowsDespQ[0].targetColumn, 'Q');
  const rowsDespR = buildReconciledSheetRows(cleaningItem, 'desperdicio', 'Desp.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rowsDespR[0].targetColumn, 'R');

  // 5. Plantilla Donaciones -> Col X
  const rowsX = buildReconciledSheetRows(sampleItem, 'donaciones', 'Donaciones.pdf', MOCK_CATALOG, opsMap);
  assert.equal(rowsX[0].targetColumn, 'X');
});

