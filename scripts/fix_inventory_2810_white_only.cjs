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
  console.log(` CORRECCIÓN QUIRÚRGICA: FILTRADO ESTRICTO DE FILAS BLANCAS (DETALLE)`);
  console.log(` EXCLUSIÓN DE TODAS LAS FILAS AMARILLAS (SUBTOTALES DEL ERP)`);
  console.log(`================================================================\n`);

  // 1. Cargar Catálogo Maestro Completo
  console.log('1. Cargando catálogo maestro completo...');
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
  console.log(`   -> ${allProducts.length} productos en catálogo.`);

  const byAccId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id !== null && p.accounting_id !== undefined) {
      byAccId.set(Number(p.accounting_id), p);
    }
  });

  // 2. Leer Excel con cellStyles y extraer ÚNICAMENTE las filas blancas (sin relleno amarillo FFFF00)
  console.log('2. Leyendo Excel y filtrando filas blancas...');
  const wb = xlsx.readFile(EXCEL_PATH, { cellStyles: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const cleanItems = [];
  for (let r = 2; r <= 176; r++) {
    const cellA = ws[`A${r}`];
    const cellB = ws[`B${r}`];
    const cellC = ws[`C${r}`];
    const cellD = ws[`D${r}`];
    
    const isYellow = cellA?.s?.fgColor?.rgb === 'FFFF00' || cellB?.s?.fgColor?.rgb === 'FFFF00' || cellD?.s?.fgColor?.rgb === 'FFFF00';
    if (!isYellow) {
      const accId = Number(cellB?.v);
      const name = String(cellC?.v || '').trim();
      const qty = parseFloat(cellD?.v) || 0;
      cleanItems.push({ row: r, accId, name, qty });
    }
  }

  const totalPhysical = cleanItems.reduce((sum, it) => sum + it.qty, 0);
  console.log(`   -> Total ítems de detalle (blancos): ${cleanItems.length}`);
  console.log(`   -> Masa física total neta: ${totalPhysical.toFixed(2)} kg/und\n`);

  // 3. Mapear al catálogo
  const countedMap = new Map();
  cleanItems.forEach(it => {
    const prod = byAccId.get(it.accId);
    if (!prod) throw new Error(`Producto no encontrado en catálogo DB: ${it.accId} - ${it.name}`);
    countedMap.set(prod.id, {
      product: prod,
      qty: it.qty
    });
  });

  // 4. Actualizar inventory_stocks:
  // Para los productos que estaban con stock de la carga previa que eran subtotales (como 107 que tenía 765),
  // debemos poner en 0 los que no están en countedMap de esta bodega.
  console.log('4. Sincronizando existencias vivas en inventory_stocks...');
  
  // Primero actualizar los 119 productos con su stock real
  for (const [prodId, { qty }] of countedMap.entries()) {
    await supabase
      .from('inventory_stocks')
      .update({ quantity: qty, updated_at: new Date().toISOString() })
      .eq('product_id', prodId)
      .eq('warehouse_id', WAREHOUSE_ID);
  }

  // Ahora corregir a 0 los productos que eran subtotales amarillos duplicados:
  // e.g. 107 (Cebolla cabezona roja), 110 (Cebolla larga), 154 (Papa sabanera lavada), 158 (Platano maduro),
  // 191 (Mazorca en tuza), 866 (Sal refisal), 844 (Yuca armenia extra), 1202 (Pasta de ajo galon x 4 kg)
  const yellowAccIds = [107, 110, 154, 158, 191, 866, 844, 1202];
  for (const yAccId of yellowAccIds) {
    const prod = byAccId.get(yAccId);
    if (prod && !countedMap.has(prod.id)) {
      console.log(`   -> Reseteando subtotal duplicado en stock a 0: #${yAccId} (${prod.name})`);
      await supabase
        .from('inventory_stocks')
        .update({ quantity: 0, updated_at: new Date().toISOString() })
        .eq('product_id', prod.id)
        .eq('warehouse_id', WAREHOUSE_ID);
    }
  }

  // 5. Construir snapshot_items canónico para daily_inventory_closings
  console.log('5. Reconstruyendo snapshot canónico de 1.362 SKUs...');
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

  // 6. Actualizar Cierre Oficial en daily_inventory_closings
  console.log(`6. Actualizando Cierre Oficial ${TARGET_DATE} en daily_inventory_closings...`);
  const { data: updateData, error: closeErr } = await supabase
    .from('daily_inventory_closings')
    .update({
      total_physical: totalPhysical,
      total_surplus: totalPhysical,
      snapshot_items: snapshotItems,
      notes: `Cierre oficial ${TARGET_DATE} depurado: solo filas blancas (119 SKUs de detalle, 0 subtotales amarillos)`,
      updated_at: new Date().toISOString()
    })
    .eq('closing_date', TARGET_DATE)
    .select('id, closing_date, total_physical');

  if (closeErr) throw closeErr;
  console.log('   -> Cierre Oficial actualizado:', updateData);

  console.log('\n================================================================');
  console.log(` CORRECCIÓN FINALIZADA: TOTAL BODEGA = ${totalPhysical.toFixed(2)} KG`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('Error durante la corrección:', err);
  process.exit(1);
});
