const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_DATE = '2026-10-07';
const PREV_DATE = '2026-10-06';
const WAREHOUSE_ID = 'd606c381-45bd-45f3-a0a9-9b8b3b196ac3';
const EXCEL_PATH = 'C:/Users/German Higuera/OneDrive/Desktop/detalle_inventario_2026-10-05.xlsx';

async function main() {
  console.log(`================================================================`);
  console.log(` CARGA PERFECTA 1:1 DE BALANCE DE INVENTARIO (${TARGET_DATE})`);
  console.log(`================================================================\n`);

  // 1. Cargar productos maestros
  console.log('1. Cargando catálogo maestro de productos de Supabase...');
  let allDbProducts = [];
  let fromP = 0;
  const stepP = 1000;
  while (true) {
    const { data: pBatch, error: pErr } = await supabase
      .from('products')
      .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure')
      .range(fromP, fromP + stepP - 1);
    if (pErr) throw pErr;
    if (!pBatch || pBatch.length === 0) break;
    allDbProducts = allDbProducts.concat(pBatch);
    if (pBatch.length < stepP) break;
    fromP += stepP;
  }

  const byAccId = new Map();
  const byName = new Map();
  allDbProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(Number(p.accounting_id), p);
    if (p.name) byName.set(p.name.trim().toLowerCase(), p);
  });
  console.log(`   -> ${allDbProducts.length} productos cargados en memoria.\n`);

  // 2. Parsear Excel con mapeo EXACTO de columnas
  console.log(`2. Leyendo y mapeando columnas exactas desde: ${EXCEL_PATH}`);
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const rowsByAccId = new Map();
  for (let i = 3; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || !r[1]) continue;
    const accId = Number(r[1]);
    const name = String(r[3] || '').trim();

    const parseNum = (v) => {
      if (v === undefined || v === null || v === '') return 0;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      return isNaN(n) ? 0 : n;
    };

    const rowObj = {
      rowIdx: i + 1,
      accId,
      list: r[2] || '',
      name,
      initial: parseNum(r[4]),        // Col E: Inventario inicial
      corrections: parseNum(r[5]),    // Col F: Corrección de inventario
      purchases: parseNum(r[6]),      // Col G: Compra del día
      salesKg: parseNum(r[7]),        // Col H: Venta del día (KG)
      salesUnits: parseNum(r[8]),     // Col I: Venta del día (UN)
      weightSalesUnits: parseNum(r[9]),// Col J: Peso Venta UN
      shortage: parseNum(r[10]),      // Col K: Producto escaso
      unshipped: parseNum(r[11]),     // Col L: Producto sin enviar
      unprepared: parseNum(r[12]),    // Col M: Venta sin alistar
      additional: parseNum(r[13]),    // Col N: Venta adicional
      returns: parseNum(r[14]),       // Col O: Devoluciones
      weighing: parseNum(r[15]),      // Col P: Pesada
      damage: parseNum(r[16]),        // Col Q: Desperdicio
      cleaning: parseNum(r[17]),      // Col R: Basura
      calculated: parseNum(r[18]),    // Col S: Inventario calculado
      agregadoBodega: parseNum(r[19]),// Col T: Inventario agregado bodega
      bodega: parseNum(r[20]),        // Col U: Inventario bodega
      missing: parseNum(r[21]),       // Col V: Faltantes
      surplus: parseNum(r[22]),       // Col W: Sobrantes
    };

    if (!rowsByAccId.has(accId)) {
      rowsByAccId.set(accId, [rowObj]);
    } else {
      rowsByAccId.get(accId).push(rowObj);
    }
  }

  // Consolidar duplicados tomando la fila de mayor inventario de bodega
  const consolidatedList = [];
  rowsByAccId.forEach((arr, accId) => {
    let chosen = arr[0];
    if (arr.length > 1) {
      chosen = arr.reduce((prev, curr) => (curr.bodega >= prev.bodega ? curr : prev));
    }
    const matched = byAccId.get(accId) || byName.get(chosen.name.toLowerCase());
    consolidatedList.push({
      accId,
      product: matched || null,
      data: chosen
    });
  });

  console.log(`   -> Total SKUs únicos consolidados: ${consolidatedList.length}`);
  const matchedList = consolidatedList.filter(c => c.product);
  console.log(`   -> SKUs vinculados al catálogo: ${matchedList.length} de ${consolidatedList.length}\n`);

  // 3. Crear Cierre Oficial Previo (D-1: 2026-10-06) para que Col E herede el Inicial exacto
  console.log(`3. Insertando Cierre Previo (${PREV_DATE}) para fijar Inventario Inicial (Col E)...`);
  const prevSnapshotItems = matchedList.map(({ product, data }) => ({
    productId: product.id,
    accountingId: data.accId,
    productName: product.name,
    inventoryGroup: product.inventory_group || data.list,
    bodegaPost10am: data.initial,
    physicalCount: data.initial,
    calculatedStock: data.initial
  }));

  const { error: prevCloseErr } = await supabase
    .from('daily_inventory_closings')
    .upsert({
      closing_date: PREV_DATE,
      closed_at: `${PREV_DATE}T23:59:59.000Z`,
      closed_by_name: 'Supervisor de Operaciones (Línea Base D-1)',
      notes: 'Cierre D-1 para fijar saldo inicial oficial inmutable (Col E) para la jornada 2026-10-07',
      total_calculated: prevSnapshotItems.reduce((acc, it) => acc + it.bodegaPost10am, 0),
      total_physical: prevSnapshotItems.reduce((acc, it) => acc + it.bodegaPost10am, 0),
      total_missing: 0,
      total_surplus: 0,
      is_locked: true,
      snapshot_items: prevSnapshotItems,
      updated_at: new Date().toISOString()
    }, { onConflict: 'closing_date' });
  if (prevCloseErr) throw prevCloseErr;
  console.log(`   -> Cierre previo del ${PREV_DATE} registrado con éxito. Col E asegurada 1:1.\n`);

  // 4. Inyectar Movimientos de Hoy (2026-10-07)
  console.log(`4. Generando movimientos operativos para ${TARGET_DATE}...`);
  const movementsToInsert = [];
  const timestampIso = `${TARGET_DATE}T12:00:00.000Z`;

  matchedList.forEach(({ product, data }) => {
    const prodId = product.id;
    const isUnit = ['un', 'und', 'unidad', 'bandeja', 'atado', 'paquete'].includes((product.unit_of_measure || '').toLowerCase());

    // F: Corrección de inventario
    if (Math.abs(data.corrections) > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: data.corrections,
        type: 'adjustment',
        reference_type: 'correction',
        notes: `[SIMULACIÓN] Corrección Excel: ${data.corrections > 0 ? '+' : ''}${data.corrections.toFixed(2)}`,
        created_at: timestampIso
      });
    }

    // G: Compra del día (+)
    if (data.purchases > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: data.purchases,
        type: 'entry',
        reference_type: 'purchase_reception',
        notes: `[SIMULACIÓN] Compra del día cargada por Excel (${data.purchases.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // H: Venta del día KG (-) & I/J: Venta UN
    if (isUnit) {
      const units = data.salesUnits > 0 ? data.salesUnits : data.salesKg;
      const weight = data.weightSalesUnits > 0 ? data.weightSalesUnits : units;
      if (units > 0.0001) {
        movementsToInsert.push({
          product_id: prodId,
          warehouse_id: WAREHOUSE_ID,
          quantity: -units,
          type: 'exit',
          reference_type: 'order_item',
          notes: `[SIMULACIÓN] Venta UN (peso: ${weight.toFixed(2)}) cargada por Excel`,
          created_at: timestampIso
        });
      }
    } else {
      if (data.salesKg > 0.0001) {
        movementsToInsert.push({
          product_id: prodId,
          warehouse_id: WAREHOUSE_ID,
          quantity: -data.salesKg,
          type: 'exit',
          reference_type: 'order_item',
          notes: `[SIMULACIÓN] Venta del día KG cargada por Excel (-${data.salesKg.toFixed(2)} kg)`,
          created_at: timestampIso
        });
      }
    }

    // K: Escaso (-)
    if (data.shortage > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.shortage,
        type: 'exit',
        reference_type: 'order_shortage',
        notes: `[SIMULACIÓN] Producto escaso reportado (-${data.shortage.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // L: Sin Enviar (+)
    if (data.unshipped > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: data.unshipped,
        type: 'entry',
        reference_type: 'order_unshipped',
        notes: `[SIMULACIÓN] Producto retenido / sin enviar (+${data.unshipped.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // N: Venta Adicional (-)
    if (data.additional > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.additional,
        type: 'exit',
        reference_type: 'additional_sale',
        notes: `[SIMULACIÓN] Venta adicional cliente mostrador (-${data.additional.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // O: Devoluciones (+)
    if (data.returns > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: data.returns,
        type: 'entry',
        reference_type: 'route_return',
        notes: `[SIMULACIÓN] Devolución de ruta (+${data.returns.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // P: Merma Pesada (-)
    if (data.weighing > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.weighing,
        type: 'exit',
        reference_type: 'waste_weighing',
        notes: `[SIMULACIÓN] Merma de pesada / báscula (-${data.weighing.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // Q: Merma Desperdicio (-)
    if (data.damage > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.damage,
        type: 'exit',
        reference_type: 'waste_damage',
        notes: `[SIMULACIÓN] Desperdicio / producto averiado (-${data.damage.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // R: Merma Basura (-)
    if (data.cleaning > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.cleaning,
        type: 'exit',
        reference_type: 'waste_cleaning',
        notes: `[SIMULACIÓN] Basura / limpieza descapote (-${data.cleaning.toFixed(2)} kg)`,
        created_at: timestampIso
      });
    }

    // T: Conteo Físico Bodega
    if (data.bodega !== null && data.bodega !== undefined) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: 0,
        type: 'adjustment',
        reference_type: 'blind_count_shift_close',
        notes: `[SIMULACIÓN] Cruce a ciegas fin de turno | Contado: ${data.bodega.toFixed(2)}`,
        created_at: timestampIso
      });
    }
  });

  console.log(`   -> Inyectando ${movementsToInsert.length} movimientos operativos reales...`);
  const batchSize = 100;
  for (let i = 0; i < movementsToInsert.length; i += batchSize) {
    const chunk = movementsToInsert.slice(i, i + batchSize);
    const { error: insErr } = await supabase.from('inventory_movements').insert(chunk);
    if (insErr) throw insErr;
  }
  console.log(`   -> Movimientos insertados correctamente.\n`);

  // 5. Actualizar inventory_stocks
  console.log('5. Sincronizando inventory_stocks con el conteo de bodega...');
  const chunks = [];
  for (let i = 0; i < matchedList.length; i += 25) {
    chunks.push(matchedList.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async ({ product, data }) => {
      await supabase
        .from('inventory_stocks')
        .update({ quantity: data.bodega, updated_at: new Date().toISOString() })
        .eq('product_id', product.id)
        .eq('warehouse_id', WAREHOUSE_ID);
    }));
  }
  console.log(`   -> inventory_stocks sincronizado para ${matchedList.length} productos.\n`);

  // 6. Insertar Cierre Oficial de Hoy (2026-10-07)
  console.log(`6. Registrando Cierre Oficial en daily_inventory_closings para ${TARGET_DATE}...`);
  let totalCalculated = 0;
  let totalPhysical = 0;
  let totalMissing = 0;
  let totalSurplus = 0;

  const todaySnapshotItems = matchedList.map(({ product, data }) => {
    totalCalculated += data.calculated;
    totalPhysical += data.bodega;
    totalMissing += data.missing;
    totalSurplus += data.surplus;

    return {
      productId: product.id,
      accountingId: data.accId,
      productName: product.name,
      inventoryGroup: product.inventory_group || data.list,
      initialStock: data.initial,
      corrections: data.corrections,
      purchases: data.purchases,
      salesKg: data.salesKg,
      salesUnits: data.salesUnits,
      weightSalesUnits: data.weightSalesUnits,
      shortage: data.shortage,
      unshipped: data.unshipped,
      additionalSales: data.additional,
      employeeSales: 0,
      returns: data.returns,
      weighingWaste: data.weighing,
      damageWaste: data.damage,
      cleaningWaste: data.cleaning,
      calculatedStock: data.calculated,
      physicalCount: data.bodega,
      bodegaPost10am: data.bodega,
      missing: data.missing,
      surplus: data.surplus,
      foodBank: 0
    };
  });

  const { error: closeErr } = await supabase
    .from('daily_inventory_closings')
    .upsert({
      closing_date: TARGET_DATE,
      closed_at: new Date().toISOString(),
      closed_by_name: 'Supervisor de Operaciones (Cierre Oficial)',
      notes: `Cierre oficial cargado 1:1 desde detalle_inventario_2026-10-05.xlsx`,
      total_calculated: totalCalculated,
      total_physical: totalPhysical,
      total_missing: totalMissing,
      total_surplus: totalSurplus,
      is_locked: true,
      snapshot_items: todaySnapshotItems,
      updated_at: new Date().toISOString()
    }, { onConflict: 'closing_date' });
  if (closeErr) throw closeErr;
  console.log(`   -> Cierre oficial de ${TARGET_DATE} registrado e inmutable.\n`);

  // 7. Actualizar script de rollback
  const rollbackCode = `const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function rollback() {
  console.log('Iniciando rollback del inventario de simulación...');

  // 1. Eliminar movimientos de simulación
  const { error: movErr } = await supabase
    .from('inventory_movements')
    .delete()
    .gte('created_at', '2026-10-07T00:00:00.000Z')
    .lte('created_at', '2026-10-07T23:59:59.999Z')
    .ilike('notes', '%[SIMULACIÓN]%');
  if (movErr) console.error('Error eliminando movimientos:', movErr);
  else console.log('Movimientos de simulación eliminados.');

  // 2. Eliminar cierres oficiales creados
  const { error: c1 } = await supabase.from('daily_inventory_closings').delete().in('closing_date', ['2026-10-06', '2026-10-07']);
  if (c1) console.error('Error eliminando cierres:', c1);
  else console.log('Cierres oficiales de 2026-10-06 y 2026-10-07 eliminados.');

  console.log('Rollback completado.');
}

rollback().catch(console.error);
`;
  fs.writeFileSync('scripts/rollback_today_inventory.cjs', rollbackCode, 'utf-8');

  console.log('================================================================');
  console.log(' ¡CARGA PERFECTA CONCLUIDA! REVISA AHORA LA PANTALLA.');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\nError crítico:', err);
  process.exit(1);
});
