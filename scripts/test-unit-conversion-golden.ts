import assert from 'node:assert/strict';
import {
  resolveCanonicalConversion,
  computeLineWeightKg,
  getSafeProductMinSaleKg,
  extractPackWeightKgFromText,
  hasExplicitLibraWord,
  hasExplicitUnitWord,
  normalizeCanonicalUnit,
} from '../src/lib/orders/unitConversionEngine';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function runCase(id: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ id, name, passed: true });
    console.log(`PASS [${id}] ${name}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ id, name, passed: false, detail: msg });
    console.error(`FAIL [${id}] ${name}: ${msg}`);
  }
}

const albahacaProd = { id: 'prod-3', name: 'Albahaca', unit_of_measure: 'Kg', weight_kg: 0.1 };
const albahaconProd = { id: 'prod-4', name: 'Albahacón', unit_of_measure: 'Kg', weight_kg: 0.1 };
const cherryProd = {
  id: 'prod-76',
  name: 'Tomate cherry',
  unit_of_measure: 'Kg',
  weight_kg: 0.5,
  options_config: [
    { name: 'Presentación', values: ['Kg', 'Libra 500g|500', 'Bandeja|500'] },
  ],
};

// TC-1: Albahaca + Kg
runCase('TC-1', 'Albahaca + Kg nunca dispara falso positivo por substring lb', () => {
  assert.equal(hasExplicitLibraWord('Albahaca'), false);
  const res = resolveCanonicalConversion({
    rawName: 'Albahaca',
    rawDocumentUnit: 'Kg',
    quantity: 2,
    product: albahacaProd,
  });
  assert.equal(res.billingQty, 2);
  assert.equal(res.billingUnit, 'Kg');
  assert.equal(res.factor, 1);
});

// TC-2: Albahacón + Kg
runCase('TC-2', 'Albahacon + Kg preserva 2 Kg con factor 1', () => {
  assert.equal(hasExplicitLibraWord('Albahacon'), false);
  const res = resolveCanonicalConversion({
    rawName: 'Albahacon',
    rawDocumentUnit: 'Kg',
    quantity: 2,
    product: albahaconProd,
  });
  assert.equal(res.billingQty, 2);
  assert.equal(res.billingUnit, 'Kg');
  assert.equal(res.factor, 1);
});

// TC-3: Borrador legado envenenado ALBAHACON Kilo + Solicitado en Libras.
runCase('TC-3', 'Saneamiento de borrador legado envenenado ALBAHACON Kilo (Lb -> Kg)', () => {
  const res = resolveCanonicalConversion({
    rawName: 'ALBAHACON Kilo',
    rawDocumentUnit: 'Lb',
    observations: 'Solicitado en Libras.',
    quantity: 2,
    product: albahaconProd,
  });
  assert.equal(res.sanitizedPoisonedLibra, true);
  assert.equal(res.billingQty, 2);
  assert.equal(res.factor, 1);
  assert.equal(res.originalUnit, 'Kg');
});

// TC-4: ALBAHACA sin unidad explicita en documento (rawDocumentUnit: null)
runCase('TC-4', 'ALBAHACA con rawDocumentUnit: null queda 1 Kg sin multiplicar por libra', () => {
  const res = resolveCanonicalConversion({
    rawName: 'ALBAHACA',
    rawDocumentUnit: null,
    quantity: 1,
    product: albahacaProd,
  });
  assert.equal(res.billingQty, 1);
  assert.equal(res.factor, 1);
});

// TC-5: ALBAHACA explicita en Libras (si debe aplicar factor 0.5)
runCase('TC-5', 'ALBAHACA explícita en Libras convierte correctamente con factor 0.5', () => {
  const resDoc = resolveCanonicalConversion({
    rawName: 'ALBAHACA',
    rawDocumentUnit: 'Lb',
    observations: '',
    quantity: 1,
    product: albahacaProd,
  });
  assert.equal(resDoc.billingQty, 0.5);
  assert.equal(resDoc.factor, 0.5);

  const resName = resolveCanonicalConversion({
    rawName: 'ALBAHACA 1 LIBRA',
    rawDocumentUnit: null,
    quantity: 1,
    product: albahacaProd,
  });
  assert.equal(resName.billingQty, 0.5);
  assert.equal(resName.factor, 0.5);
});

// TC-6: Colsubsidio TOMATE CHERRY CANASTA INTS 500 GR con 4 UN -> 2 Kg
runCase('TC-6', 'Colsubsidio TOMATE CHERRY CANASTA INTS 500 GR (4 UN -> 2 Kg)', () => {
  const res = resolveCanonicalConversion({
    rawName: 'TOMATE CHERRY CANASTA INTS 500 GR',
    rawDocumentUnit: 'UN',
    quantity: 4,
    product: cherryProd,
  });
  assert.equal(res.billingQty, 2);
  assert.equal(res.factor, 0.5);
});

// TC-7: Colsubsidio TOMATE CHERRY CANASTA INTS 500 GR con 30 UN -> 15 Kg
runCase('TC-7', 'Colsubsidio TOMATE CHERRY CANASTA INTS 500 GR (30 UN -> 15 Kg)', () => {
  const res = resolveCanonicalConversion({
    rawName: 'TOMATE CHERRY CANASTA INTS 500 GR',
    rawDocumentUnit: 'UN',
    quantity: 30,
    product: cherryProd,
  });
  assert.equal(res.billingQty, 15);
  assert.equal(res.factor, 0.5);
});

// TC-8: Unidad explícita Kg vence "500 GR" en nombre
runCase('TC-8', 'Unidad explícita Kg vence "500 GR" en nombre del ítem (factor 1)', () => {
  const res = resolveCanonicalConversion({
    rawName: 'TOMATE CHERRY CANASTA 500 GR',
    rawDocumentUnit: 'Kg',
    quantity: 2,
    product: cherryProd,
  });
  assert.equal(res.billingQty, 2);
  assert.equal(res.factor, 1);
});

// TC-9: PAPA SABANERA SEGUNDA sin unidad + conversion DB Unidad->Kg=0.2
runCase('TC-9', 'PAPA SABANERA SEGUNDA no dispara falso positivo por substring "und"', () => {
  assert.equal(hasExplicitUnitWord('PAPA SABANERA SEGUNDA'), false);
  const res = resolveCanonicalConversion({
    rawName: 'PAPA SABANERA SEGUNDA',
    rawDocumentUnit: null,
    quantity: 10,
    product: { id: 'prod-papa', name: 'Papa sabanera segunda', unit_of_measure: 'Kg' },
    productConversions: [{ from_unit: 'Unidad', to_unit: 'Kg', conversion_factor: 0.2 }],
  });
  assert.equal(res.billingQty, 10);
  assert.equal(res.factor, 1);
});

// TC-10: COGOLLOS DE TUDELA sin unidad + conversion DB Unidad->Kg=0.3
runCase('TC-10', 'COGOLLOS DE TUDELA no dispara falso positivo por substring "ud"', () => {
  assert.equal(hasExplicitUnitWord('COGOLLOS DE TUDELA'), false);
  const res = resolveCanonicalConversion({
    rawName: 'COGOLLOS DE TUDELA',
    rawDocumentUnit: null,
    quantity: 5,
    product: { id: 'prod-cog', name: 'Cogollos europeos', unit_of_measure: 'Kg' },
    productConversions: [{ from_unit: 'Unidad', to_unit: 'Kg', conversion_factor: 0.3 }],
  });
  assert.equal(res.billingQty, 5);
  assert.equal(res.factor, 1);
});

// TC-11: PLU 5001 TOMATE CHERRY -> extractPackWeightKgFromText === null
runCase('TC-11', 'PLU 5001 TOMATE CHERRY ignora dígito PLU sin convertirlo en gramaje', () => {
  assert.equal(extractPackWeightKgFromText('PLU 5001 TOMATE CHERRY'), null);
  const res = resolveCanonicalConversion({
    rawName: 'PLU 5001 TOMATE CHERRY',
    rawDocumentUnit: null,
    quantity: 3,
    product: cherryProd,
  });
  assert.equal(res.billingQty, 3);
  assert.equal(res.factor, 1);
});

// TC-12: getSafeProductMinSaleKg
runCase('TC-12', 'getSafeProductMinSaleKg permite 0.01 Kg en aromáticas/cherry y protege enteros pesados', () => {
  const feijoaCherry = {
    id: 'prod-feijoa',
    name: 'Feijoa / Tomate cherry',
    unit_of_measure: 'Kg',
    weight_kg: 0.1,
    options_config: [{ name: 'Presentación', values: ['Kg', 'Libra 500g|500'] }],
  };
  assert.equal(getSafeProductMinSaleKg(feijoaCherry), 0.01);
  assert.equal(getSafeProductMinSaleKg(albahacaProd), 0.01);
  assert.equal(getSafeProductMinSaleKg(cherryProd), 0.01);

  const patilla = { id: 'prod-patilla', name: 'Patilla', unit_of_measure: 'Kg', weight_kg: 4 };
  assert.equal(getSafeProductMinSaleKg(patilla), 4);
});

// TC-13: Idempotencia (alreadyNormalized & isManuallyEditedQty)
runCase('TC-13', 'Idempotencia evita doble multiplicación/división tras normalizar o editar manualmente', () => {
  const firstPass = resolveCanonicalConversion({
    rawName: 'TOMATE CHERRY CANASTA INTS 500 GR',
    rawDocumentUnit: 'UN',
    quantity: 4,
    product: cherryProd,
  });
  assert.equal(firstPass.billingQty, 2);

  const secondPassNormalized = resolveCanonicalConversion({
    rawName: 'TOMATE CHERRY CANASTA INTS 500 GR',
    rawDocumentUnit: 'UN',
    quantity: firstPass.billingQty,
    product: cherryProd,
    alreadyNormalized: true,
  });
  assert.equal(secondPassNormalized.billingQty, 2);
  assert.equal(secondPassNormalized.factor, 1);

  const secondPassManual = resolveCanonicalConversion({
    rawName: 'TOMATE CHERRY CANASTA INTS 500 GR',
    rawDocumentUnit: 'UN',
    quantity: firstPass.billingQty,
    product: cherryProd,
    isManuallyEditedQty: true,
  });
  assert.equal(secondPassManual.billingQty, 2);
  assert.equal(secondPassManual.factor, 1);
});

// TC-14: Proteccion Escenario 458 (from_unit === to_unit ignorada)
runCase('TC-14', 'Protección Escenario 458 ignora fila contradictoria Kg -> Kg en product_conversions', () => {
  assert.equal(normalizeCanonicalUnit('Kilo'), 'Kg');
  const res = resolveCanonicalConversion({
    rawName: 'Albahacón',
    rawDocumentUnit: 'Caja',
    quantity: 3,
    product: albahaconProd,
    productConversions: [{ from_unit: 'Kg', to_unit: 'Kg', conversion_factor: 0.5 }],
  });
  assert.equal(res.billingQty, 3);
  assert.equal(res.factor, 1);
});

// TC-15: computeLineWeightKg paridad logística y World Office
runCase('TC-15', 'computeLineWeightKg calcula peso real sin doble multiplicación sobre Kg', () => {
  assert.equal(
    computeLineWeightKg({
      quantity: 2,
      billingUnit: 'Kg',
      productUnitOfMeasure: 'Kg',
      productWeightKg: 0.5,
    }),
    2
  );
  assert.equal(
    computeLineWeightKg({
      quantity: 2,
      billingUnit: 'UN',
      productUnitOfMeasure: 'Kg',
      productWeightKg: 0.5,
    }),
    2
  );
  assert.equal(
    computeLineWeightKg({
      quantity: 5,
      billingUnit: 'Unidad',
      productUnitOfMeasure: 'Unidad',
      productWeightKg: 1.8,
    }),
    9
  );
  assert.equal(
    computeLineWeightKg({
      quantity: 4,
      billingUnit: 'Lb',
      productUnitOfMeasure: 'Lb',
      productWeightKg: 0.5,
    }),
    2
  );
});

// TC-16: Productos no-Kg (Cubeta huevos x 30 unds y Pasta de ajo x 1000 grs)
runCase('TC-16', 'Productos no-Kg dividen solo por empaque en unidades y jamás por gr/grs', () => {
  const cubetaHuevos = {
    id: 'prod-663',
    name: 'Cubeta huevos tipo aa x 30 unds.',
    unit_of_measure: 'Cubeta',
    weight_kg: 1.8,
  };
  const resCubeta = resolveCanonicalConversion({
    rawName: 'Huevos tipo AA',
    rawDocumentUnit: 'UN',
    quantity: 60,
    product: cubetaHuevos,
  });
  assert.equal(resCubeta.billingQty, 2);
  assert.equal(resCubeta.billingUnit, 'Cubeta');

  const pastaAjo = {
    id: 'prod-1316',
    name: 'Pasta de ajo x 1000 grs',
    unit_of_measure: 'Unidad',
    weight_kg: 1,
  };
  const resAjo = resolveCanonicalConversion({
    rawName: 'Pasta de ajo x 1000 grs',
    rawDocumentUnit: 'UN',
    quantity: 2,
    product: pastaAjo,
  });
  assert.equal(resAjo.billingQty, 2);
  assert.equal(resAjo.billingUnit, 'Unidad');
  assert.equal(resAjo.factor, 1);
});

const passedCount = results.filter(r => r.passed).length;
const failedCount = results.length - passedCount;
console.log(`\nGolden Dataset Summary: ${passedCount}/${results.length} passed, ${failedCount} failed.`);

if (failedCount > 0) {
  process.exit(1);
}
