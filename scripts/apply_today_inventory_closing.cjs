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
const TIMESTAMP_ISO = `${TARGET_DATE}T12:00:00.000Z`;
const WAREHOUSE_ID = 'd606c381-45bd-45f3-a0a9-9b8b3b196ac3';
const EXCEL_PATH = 'C:/Users/German Higuera/OneDrive/Desktop/detalle_inventario_2026-10-05.xlsx';

async function main() {
  console.log(`================================================================`);
  console.log(` CARGA DE LINEA BASE DE INVENTARIO - CIERRE DE HOY (${TARGET_DATE})`);
  console.log(`================================================================\n`);

  // 1. Respaldar estado previo de inventory_stocks
  console.log('1. Creando snapshot de seguridad de inventory_stocks...');
  let prevStocks = [];
  let fromS = 0;
  const stepS = 1000;
  while (true) {
    const { data: sBatch, error: sErr } = await supabase
      .from('inventory_stocks')
      .select('*')
      .eq('warehouse_id', WAREHOUSE_ID)
      .range(fromS, fromS + stepS - 1);
    if (sErr) throw sErr;
    if (!sBatch || sBatch.length === 0) break;
    prevStocks = prevStocks.concat(sBatch);
    if (sBatch.length < stepS) break;
    fromS += stepS;
  }

  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `inventory_stocks_before_${TARGET_DATE.replace(/-/g, '')}_simulation.json`);
  fs.writeFileSync(backupFile, JSON.stringify(prevStocks, null, 2), 'utf-8');
  console.log(`   -> Snapshot guardado exitosamente: ${backupFile} (${prevStocks.length} registros)\n`);

  // 2. Cargar Catálogo de Productos
  console.log('2. Cargando catálogo maestro de productos de Supabase...');
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

  // 3. Parsear Excel y Consolidar
  console.log(`3. Leyendo y consolidando Excel: ${EXCEL_PATH}`);
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const rowsByAccId = new Map();
  for (let i = 3; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || !r[1]) continue;
    const accId = Number(r[1]);
    const name = String(r[3] || '').trim();
    const rowObj = {
      rowIdx: i + 1,
      accId,
      list: r[2] || '',
      name,
      initial: parseFloat(r[4]) || 0,
      corrections: parseFloat(r[5]) || 0,
      purchases: parseFloat(r[6]) || 0,
      salesKg: parseFloat(r[7]) || 0,
      salesUnits: parseFloat(r[8]) || 0,
      weightSalesUnits: parseFloat(r[9]) || 0,
      shortage: parseFloat(r[10]) || 0,
      unshipped: parseFloat(r[11]) || 0,
      unprepared: parseFloat(r[12]) || 0,
      additional: parseFloat(r[13]) || 0,
      employee: parseFloat(r[14]) || 0,
      returns: parseFloat(r[15]) || 0,
      weighing: parseFloat(r[16]) || 0,
      damage: parseFloat(r[17]) || 0,
      cleaning: parseFloat(r[18]) || 0,
      calculated: parseFloat(r[19]) || 0,
      bodega: parseFloat(r[20]) || 0,
      missing: parseFloat(r[21]) || 0,
      surplus: parseFloat(r[22]) || 0,
      foodBank: parseFloat(r[23]) || 0,
    };

    if (!rowsByAccId.has(accId)) {
      rowsByAccId.set(accId, [rowObj]);
    } else {
      rowsByAccId.get(accId).push(rowObj);
    }
  }

  // Resolver duplicados tomando la fila de mayor inventario en bodega (consolidada)
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
  const matchedCount = consolidatedList.filter(c => c.product).length;
  console.log(`   -> SKUs vinculados al catálogo: ${matchedCount} de ${consolidatedList.length}\n`);

  // 4. Generar Movimientos de Kardex para 2026-10-07
  console.log('4. Generando e insertando inventory_movements...');
  const movementsToInsert = [];

  consolidatedList.forEach(({ product, data }) => {
    if (!product) return;
    const prodId = product.id;

    // F: Corrección de inventario (+/-)
    if (Math.abs(data.corrections) > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: data.corrections,
        type: 'adjustment',
        reference_type: 'correction',
        notes: `[SIMULACIÓN] Corrección Excel: ${data.corrections > 0 ? '+' : ''}${data.corrections.toFixed(2)}`,
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
      });
    }

    // H: Venta del día KG (-)
    if (data.salesKg > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.salesKg,
        type: 'exit',
        reference_type: 'order_item',
        notes: `[SIMULACIÓN] Venta del día KG cargada por Excel (-${data.salesKg.toFixed(2)} kg)`,
        created_at: TIMESTAMP_ISO
      });
    }

    // J: Peso Venta UN (-)
    if (data.weightSalesUnits > 0.0001 && data.salesKg <= 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.weightSalesUnits,
        type: 'exit',
        reference_type: 'order_item',
        notes: `[SIMULACIÓN] Venta UN (peso: ${data.weightSalesUnits.toFixed(2)}) cargada por Excel`,
        created_at: TIMESTAMP_ISO
      });
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
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
      });
    }

    // M: Venta Adicional (-)
    if (data.additional > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.additional,
        type: 'exit',
        reference_type: 'additional_sale',
        notes: `[SIMULACIÓN] Venta adicional cliente mostrador (-${data.additional.toFixed(2)} kg)`,
        created_at: TIMESTAMP_ISO
      });
    }

    // N: Venta Empleado (-)
    if (data.employee > 0.0001) {
      movementsToInsert.push({
        product_id: prodId,
        warehouse_id: WAREHOUSE_ID,
        quantity: -data.employee,
        type: 'exit',
        reference_type: 'employee_sale',
        notes: `[SIMULACIÓN] Venta nómina colaborador (-${data.employee.toFixed(2)} kg)`,
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
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
        created_at: TIMESTAMP_ISO
      });
    }
  });

  console.log(`   -> Total movimientos generados: ${movementsToInsert.length}`);
  const batchSize = 100;
  for (let i = 0; i < movementsToInsert.length; i += batchSize) {
    const chunk = movementsToInsert.slice(i, i + batchSize);
    const { error: insErr } = await supabase.from('inventory_movements').insert(chunk);
    if (insErr) throw insErr;
  }
  console.log(`   -> Movimientos inyectados con éxito en la tabla inventory_movements.\n`);

  // 5. Inyectar o Actualizar inventory_stocks
  console.log('5. Sincronizando stock disponible en inventory_stocks...');
  const stocksToUpsert = [];
  consolidatedList.forEach(({ product, data }) => {
    if (!product) return;
    stocksToUpsert.push({
      product_id: product.id,
      warehouse_id: WAREHOUSE_ID,
      quantity: Math.max(0, data.bodega),
      status: 'available',
      updated_at: new Date().toISOString()
    });
  });

  for (let i = 0; i < stocksToUpsert.length; i += batchSize) {
    const chunk = stocksToUpsert.slice(i, i + batchSize);
    const { error: stockErr } = await supabase
      .from('inventory_stocks')
      .upsert(chunk, { onConflict: 'product_id,warehouse_id' });
    if (stockErr) {
      console.warn('Upsert estándar falló por constraint, aplicando update individual:', stockErr.message);
      for (const item of chunk) {
        await supabase
          .from('inventory_stocks')
          .update({ quantity: item.quantity, updated_at: item.updated_at })
          .eq('product_id', item.product_id)
          .eq('warehouse_id', item.warehouse_id);
      }
    }
  }
  console.log(`   -> inventory_stocks sincronizado con éxito para ${stocksToUpsert.length} productos.\n`);

  // 6. Generar Snapshot y Cerrar Jornada en daily_inventory_closings
  console.log(`6. Registrando Cierre Oficial en daily_inventory_closings para ${TARGET_DATE}...`);
  let totalCalculated = 0;
  let totalPhysical = 0;
  let totalMissing = 0;
  let totalSurplus = 0;

  const snapshotItems = consolidatedList.map(({ product, data }) => {
    totalCalculated += data.calculated;
    totalPhysical += data.bodega;
    totalMissing += data.missing;
    totalSurplus += data.surplus;

    return {
      productId: product ? product.id : null,
      accountingId: data.accId,
      productName: data.name,
      inventoryGroup: product?.inventory_group || data.list,
      initialStock: data.initial,
      corrections: data.corrections,
      purchases: data.purchases,
      salesKg: data.salesKg,
      salesUnits: data.salesUnits,
      weightSalesUnits: data.weightSalesUnits,
      shortage: data.shortage,
      unshipped: data.unshipped,
      additionalSales: data.additional,
      employeeSales: data.employee,
      returns: data.returns,
      weighingWaste: data.weighing,
      damageWaste: data.damage,
      cleaningWaste: data.cleaning,
      calculatedStock: data.calculated,
      physicalCount: data.bodega,
      bodegaPost10am: data.bodega,
      missing: data.missing,
      surplus: data.surplus,
      foodBank: data.foodBank
    };
  });

  const { data: closingRecord, error: closeErr } = await supabase
    .from('daily_inventory_closings')
    .upsert({
      closing_date: TARGET_DATE,
      closed_at: new Date().toISOString(),
      closed_by_name: 'Supervisor de Operaciones (Simulación Cierre)',
      notes: `Cierre oficial cargado desde detalle_inventario_2026-10-05.xlsx para simulación de operaciones del 2026-10-08`,
      total_calculated: totalCalculated,
      total_physical: totalPhysical,
      total_missing: totalMissing,
      total_surplus: totalSurplus,
      is_locked: true,
      snapshot_items: snapshotItems,
      updated_at: new Date().toISOString()
    }, { onConflict: 'closing_date' })
    .select()
    .single();

  if (closeErr) throw closeErr;
  console.log(`   -> Cierre oficial registrado e inmutable con ID: ${closingRecord.id}`);
  console.log(`   -> Total Físico Bodega congelado: ${totalPhysical.toFixed(2)} Kg/Un\n`);

  // 7. Generar Script de Rollback Automático
  console.log('7. Creando script de reversión (rollback)...');
  const rollbackCode = `const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const TARGET_DATE = '${TARGET_DATE}';
const WAREHOUSE_ID = '${WAREHOUSE_ID}';
const BACKUP_FILE = '${backupFile.replace(/\\/g, '\\\\')}';

async function rollback() {
  console.log('Iniciando rollback del inventario de ' + TARGET_DATE + '...');

  // 1. Eliminar movimientos de simulación
  const { data: delMovs, error: movErr } = await supabase
    .from('inventory_movements')
    .delete()
    .gte('created_at', TARGET_DATE + 'T00:00:00.000Z')
    .lte('created_at', TARGET_DATE + 'T23:59:59.999Z')
    .ilike('notes', '%[SIMULACIÓN]%');
  if (movErr) console.error('Error eliminando movimientos:', movErr);
  else console.log('Movimientos de simulación eliminados con éxito.');

  // 2. Eliminar cierre oficial
  const { error: closeErr } = await supabase
    .from('daily_inventory_closings')
    .delete()
    .eq('closing_date', TARGET_DATE);
  if (closeErr) console.error('Error eliminando cierre oficial:', closeErr);
  else console.log('Cierre oficial de ' + TARGET_DATE + ' eliminado.');

  // 3. Restaurar inventory_stocks desde backup si existe
  if (fs.existsSync(BACKUP_FILE)) {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const prev = JSON.parse(raw);
    console.log('Restaurando ' + prev.length + ' stocks previos...');
    for (const item of prev) {
      await supabase
        .from('inventory_stocks')
        .update({ quantity: item.quantity, updated_at: new Date().toISOString() })
        .eq('id', item.id);
    }
    console.log('inventory_stocks restaurado exitosamente.');
  }

  console.log('Rollback completado al 100%.');
}

rollback().catch(console.error);
`;

  fs.writeFileSync(path.resolve('scripts/rollback_today_inventory.cjs'), rollbackCode, 'utf-8');
  console.log('   -> Script creado: scripts/rollback_today_inventory.cjs\n');

  console.log('================================================================');
  console.log(' ¡INVENTARIO CARGADO EXITOSAMENTE COMO CIERRE DE HOY (2026-10-07)!');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\nError crítico ejecutando carga de inventario:', err);
  process.exit(1);
});
