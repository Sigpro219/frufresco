import test from 'node:test';
import assert from 'node:assert/strict';
import { findBestProductMatchDetails } from '@/lib/orders/order-parser-engine';

const sampleCatalog = [
  { id: 'prod-15', accounting_id: 15, sku: '15', name: 'Calabacin verde', unit_of_measure: 'Kg' },
  { id: 'prod-1347', accounting_id: 1347, sku: '1347', name: 'Calabazin verde en cubos', unit_of_measure: 'Kg' },
  { id: 'prod-149', accounting_id: 149, sku: '149', name: 'Papa pastusa cero lvda', unit_of_measure: 'Kg' },
  { id: 'prod-735', accounting_id: 735, sku: '735', name: 'Tusa', unit_of_measure: 'Kg' },
  { id: 'prod-463', accounting_id: 463, sku: '463', name: 'Nispero', unit_of_measure: 'Kg' },
  { id: 'prod-1386', accounting_id: 1386, sku: '1386', name: 'Níspero', unit_of_measure: 'Kg' },
];

test('Golden Case 1: "15 calabacin" NO interpreta 15 como #15; resuelve por nombre/cantidad', () => {
  const res = findBestProductMatchDetails('15 calabacin', sampleCatalog);
  // 15 es cantidad, no hay separador estructural ni #; debe pasar por tokens/nombre (no EXACT por ID)
  assert.notEqual(res.matchReason, 'Identificador contable exacto (#15)');
  assert.equal(res.product?.id, 'prod-15');
  assert.equal(res.matchSource, 'TOKEN');
});

test('Golden Case 1b: "10 libras papa pastusa" NO interpreta 10 como accounting_id', () => {
  const catalogWithId10 = [
    { id: 'prod-10', accounting_id: 10, sku: '10', name: 'Cilantro', unit_of_measure: 'Kg' },
    ...sampleCatalog,
  ];
  const res = findBestProductMatchDetails('10 libras papa pastusa', catalogWithId10);
  assert.equal(res.product?.accounting_id, 149);
});

test('Golden Case 2a: explicitAccountingId="149" tiene soberanía absoluta sobre memoria y nombre distinto', () => {
  const poisonedMemory = [
    { normalized_text: 'tusa', matched_product_id: 'prod-735' },
  ];
  const res = findBestProductMatchDetails('Tusa', sampleCatalog, poisonedMemory, '149');
  assert.equal(res.product?.accounting_id, 149);
  assert.equal(res.confidenceScore, 100);
  assert.equal(res.matchSource, 'EXACT');
});

test('Golden Case 2b: "149 - Papa pastusa cero lvda" resuelve #149 por separador estructural', () => {
  const res = findBestProductMatchDetails('149 - Papa pastusa cero lvda', sampleCatalog);
  assert.equal(res.product?.accounting_id, 149);
  assert.equal(res.confidenceScore, 100);
  assert.equal(res.matchSource, 'EXACT');
});

test('Golden Case 2c: explicitAccountingId numérico inexistente NO adivina por nombre', () => {
  const res = findBestProductMatchDetails('Papa pastusa cero lvda', sampleCatalog, [], '999999');
  assert.equal(res.product, null);
  assert.equal(res.matchSource, 'NONE');
});

test('Golden Case 3: "Papa pastusa cero lvda" sin ID NUNCA hace match con #735 Tusa', () => {
  const onlyTusaCatalog = sampleCatalog.filter((p) => p.accounting_id === 735);
  const res = findBestProductMatchDetails('Papa pastusa cero lvda', onlyTusaCatalog);
  assert.equal(res.product, null);
});
