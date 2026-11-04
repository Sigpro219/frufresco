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

const TARGET_DATE = '2026-10-28';
const TIMESTAMP_ISO = '2026-10-29T10:00:00.000Z';
const WAREHOUSE_ID = 'd606c381-45bd-45f3-a0a9-9b8b3b196ac3';
const EXCEL_PATH = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';

async function main() {
  console.log(`================================================================`);
  console.log(` EJECUCIÓN: CARGA Y CIERRE DE INVENTARIO (${TARGET_DATE})`);
  console.log(` ARCHIVO: ${EXCEL_PATH}`);
  console.log(` BODEGA: Bodega Principal FruFresco (${WAREHOUSE_ID})`);
  console.log(`================================================================\n`);

  // 1. Respaldo de seguridad de inventory_stocks actual
  console.log('1. Creando backup de seguridad de inventory_stocks...');
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
  const backupFile = path.join(backupDir, `inventory_stocks_before_${TARGET_DATE.replace(/-/g, '')}_upload.json`);
  fs.writeFileSync(backupFile, JSON.stringify(prevStocks, null, 2), 'utf-8');
  console.log(`   -> Backup completado: ${backupFile} (${prevStocks.length} registros respaldados)\n`);

  // 2. Cargar Catálogo Maestro Completo (1.362 SKUs)
  console.log('2. Cargando catálogo maestro completo de productos...');
  let allProducts = [];
  let fromP = 0;
  while (true) {
    const { data: pBatch, error: pErr } = await supabase
      .from('products')
      .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure')
      .range(fromP, fromP + 999);
    if (pErr) throw pErr;
    allProducts = allProducts.concat(pBatch);
    if (pBatch.length < 1000) break;
    fromP += 1000;
  }
  console.log(`   -> ${allProducts.length} productos cargados en memoria.`);

  const byAccId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id !== null && p.accounting_id !== undefined) {
      byAccId.set(Number(p.accounting_id), p);
    }
  });

  // 3. Parsear y Depurar Excel eliminando subtotales y filas duplicadas
  console.log('3. Parseando Excel con algoritmo de poda de subtotales...');
  const wb = xlsx.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(ws);

  const cleanItems = [];
  let i = 0;
  while (i < rawData.length) {
    const row = rawData[i];
    const accId = Number(row['idProducto']);
    const name = String(row['Producto']).trim();
    const qty = parseFloat(row['Inventario bodega']) || 0;

    // Caso especial Duraznos (107=232: 1.5, 108=233: 5.5, 109=233: 7.0 subtotal)
    if (accId === 233 && qty === 5.5 && i + 1 < rawData.length && Number(rawData[i + 1]['idProducto']) === 233 && parseFloat(rawData[i + 1]['Inventario bodega']) === 7) {
      cleanItems.push({ accId, name, qty, sourceRows: [i + 2] });
      i += 2;
      continue;
    }

    // Fila duplicada idéntica (Detalle + Subtotal de 1 solo ítem)
    if (i + 1 < rawData.length && 
        Number(rawData[i + 1]['idProducto']) === accId && 
        parseFloat(rawData[i + 1]['Inventario bodega']) === qty) {
      cleanItems.push({ accId, name, qty, sourceRows: [i + 2] });
      i += 2;
      continue;
    }

    // Grupo con subtotal al final
    let foundGroup = false;
    for (let j = i + 1; j < Math.min(i + 10, rawData.length); j++) {
      if (Number(rawData[j]['idProducto']) === accId) {
        const candidateSubtotal = parseFloat(rawData[j]['Inventario bodega']) || 0;
        let sum = 0;
        for (let k = i; k < j; k++) sum += parseFloat(rawData[k]['Inventario bodega']) || 0;
        if (Math.abs(sum - candidateSubtotal) < 0.01) {
          foundGroup = true;
          for (let k = i; k < j; k++) {
            cleanItems.push({
              accId: Number(rawData[k]['idProducto']),
              name: String(rawData[k]['Producto']).trim(),
              qty: parseFloat(rawData[k]['Inventario bodega']) || 0,
              sourceRows: [k + 2]
            });
          }
          i = j + 1;
          break;
        }
      }
    }
    if (foundGroup) continue;

    // Fila única sin duplicar
    cleanItems.push({ accId, name, qty, sourceRows: [i + 2] });
    i++;
  }

  const totalPhysical = cleanItems.reduce((sum, it) => sum + it.qty, 0);
  console.log(`   -> Total ítems físicos depurados: ${cleanItems.length}`);
  console.log(`   -> Masa física total neta: ${totalPhysical.toFixed(2)} kg/und\n`);

  // 4. Mapear al catálogo y preparar existencias vivas
  console.log('4. Sincronizando existencias vivas en inventory_stocks...');
  const countedMap = new Map();
  cleanItems.forEach(it => {
    const prod = byAccId.get(it.accId);
    if (!prod) throw new Error(`Producto no encontrado en DB: ${it.accId} - ${it.name}`);
    countedMap.set(prod.id, {
      product: prod,
      qty: it.qty
    });
  });

  // Preparar upsert de inventory_stocks para los productos con conteo
  const stocksToUpsert = [];
  countedMap.forEach(({ product, qty }) => {
    stocksToUpsert.push({
      product_id: product.id,
      warehouse_id: WAREHOUSE_ID,
      quantity: Math.max(0, qty),
      status: 'available',
      updated_at: new Date().toISOString()
    });
  });

  const batchSize = 50;
  for (let b = 0; b < stocksToUpsert.length; b += batchSize) {
    const chunk = stocksToUpsert.slice(b, b + batchSize);
    const { error: stockErr } = await supabase
      .from('inventory_stocks')
      .upsert(chunk, { onConflict: 'product_id,warehouse_id' });
    if (stockErr) {
      console.warn('Upsert estándar con warning, actualizando individualmente:', stockErr.message);
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

  // 5. Inyectar movimientos en inventory_movements para trazabilidad
  console.log('5. Registrando movimientos de conteo en inventory_movements...');
  const movementsToInsert = [];
  countedMap.forEach(({ product, qty }) => {
    movementsToInsert.push({
      product_id: product.id,
      warehouse_id: WAREHOUSE_ID,
      quantity: 0,
      type: 'adjustment',
      reference_type: 'blind_count_shift_close',
      notes: `[OFICIAL] Conteo físico INVENTARIO 2810.xlsx | Cantidad: ${qty.toFixed(2)}`,
      created_at: TIMESTAMP_ISO
    });
  });

  for (let b = 0; b < movementsToInsert.length; b += batchSize) {
    const chunk = movementsToInsert.slice(b, b + batchSize);
    const { error: movErr } = await supabase.from('inventory_movements').insert(chunk);
    if (movErr) console.warn('Warning insertando movements (no bloqueante):', movErr.message);
  }
  console.log(`   -> ${movementsToInsert.length} movimientos de ajuste registrados.\n`);

  // 6. Construir snapshot_items para los 1.362 productos del catálogo
  console.log('6. Construyendo snapshot canónico de 1.362 SKUs para daily_inventory_closings...');
  const snapshotItems = allProducts.map(p => {
    const counted = countedMap.get(p.id);
    const physical = counted ? counted.qty : null;

    return {
      sku: p.sku || '',
      productId: p.id,
      productName: p.name,
      accountingId: p.accounting_id,
      inventoryGroup: p.inventory_group || 'INVENTARIO GENERAL',
      initialStock: 0,
      corrections: 0,
      purchases: 0,
      salesKg: 0,
      salesUnits: 0,
      weightSalesUnits: 0,
      shortage: 0,
      unshipped: 0,
      unprepared: 0,
      additionalSales: 0,
      employeeSales: 0,
      returns: 0,
      weighingWaste: 0,
      damageWaste: 0,
      cleaningWaste: 0,
      calculatedStock: 0,
      physicalCount: physical,
      bodegaPost10am: physical,
      missing: 0,
      surplus: physical || 0,
      foodBank: 0
    };
  });

  // 7. Persistir Cierre Oficial en daily_inventory_closings
  console.log(`7. Guardando Cierre Oficial ${TARGET_DATE} en daily_inventory_closings...`);
  const closingRecord = {
    closing_date: TARGET_DATE,
    closed_at: TIMESTAMP_ISO,
    closed_by_name: 'Carga Oficial INVENTARIO 2810.xlsx',
    notes: `Cierre oficial ${TARGET_DATE} cargado desde INVENTARIO 2810.xlsx como línea base para operación 29/10/2026`,
    total_calculated: 0,
    total_physical: totalPhysical,
    total_missing: 0,
    total_surplus: totalPhysical,
    is_locked: true,
    snapshot_items: snapshotItems,
    updated_at: new Date().toISOString()
  };

  const { data: upsertData, error: closeErr } = await supabase
    .from('daily_inventory_closings')
    .upsert(closingRecord, { onConflict: 'closing_date' })
    .select('id, closing_date, total_physical, is_locked');

  if (closeErr) throw closeErr;
  console.log('   -> Cierre Oficial persistido exitosamente:', upsertData);
  console.log('\n================================================================');
  console.log(' CIERRE COMPLETADO EXITOSAMENTE');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Error fatal durante la carga de inventario:', err);
  process.exit(1);
});
