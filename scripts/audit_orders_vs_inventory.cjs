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

async function runAudit() {
  console.log('=== AUDITORIA INTEGRAL: EXCEL CIERRE VS PEDIDOS 78 (2026-10-08) ===\n');

  // 1. Cargar Excel
  const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/detalle_inventario_2026-10-05.xlsx';
  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const excelRowsByAccId = new Map();
  const excelDuplicates = [];

  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[1]) continue;
    const accId = Number(row[1]);
    const name = String(row[3] || '').trim();
    const stockBodega = parseFloat(row[20]) || 0;
    const initial = parseFloat(row[4]) || 0;
    const purchases = parseFloat(row[6]) || 0;
    const salesKg = parseFloat(row[7]) || 0;

    const rowObj = { rowIdx: i + 1, accId, list: row[2], name, initial, purchases, salesKg, stockBodega, raw: row };

    if (!excelRowsByAccId.has(accId)) {
      excelRowsByAccId.set(accId, [rowObj]);
    } else {
      excelRowsByAccId.get(accId).push(rowObj);
      excelDuplicates.push(accId);
    }
  }

  console.log(`1. EXCEL:`);
  console.log(`   - Filas totales procesables: ${rawData.length - 3}`);
  console.log(`   - IDs contables únicos: ${excelRowsByAccId.size}`);
  console.log(`   - IDs contables con duplicados: ${new Set(excelDuplicates).size}`);

  // 2. Cargar catálogo de productos de Supabase (con paginación completa)
  let allDbProducts = [];
  let fromP = 0;
  const stepP = 1000;
  while (true) {
    const { data: pData, error: pErr } = await supabase
      .from('products')
      .select('id, name, sku, accounting_id, category')
      .range(fromP, fromP + stepP - 1);
    if (pErr) throw pErr;
    if (!pData || pData.length === 0) break;
    allDbProducts = allDbProducts.concat(pData);
    if (pData.length < stepP) break;
    fromP += stepP;
  }
  const dbProducts = allDbProducts;

  console.log(`\n2. CATALOGO SUPABASE:`);
  console.log(`   - Total productos en BD: ${dbProducts.length}`);

  const productByAccId = new Map();
  const productById = new Map();
  dbProducts.forEach(p => {
    productById.set(p.id, p);
    if (p.accounting_id) productByAccId.set(Number(p.accounting_id), p);
  });

  // 3. Cargar los 78 pedidos de 2026-10-08
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, delivery_date')
    .eq('delivery_date', '2026-10-08');
  if (ordErr) throw ordErr;

  console.log(`\n3. PEDIDOS EN FECHA PRUEBA (2026-10-08):`);
  console.log(`   - Total pedidos encontrados: ${orders.length}`);

  const orderIds = orders.map(o => o.id);
  let allOrderItems = [];
  let fromI = 0;
  const stepI = 1000;
  while (true) {
    const { data: itData, error: itErr } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit_price')
      .in('order_id', orderIds)
      .range(fromI, fromI + stepI - 1);
    if (itErr) throw itErr;
    if (!itData || itData.length === 0) break;
    allOrderItems = allOrderItems.concat(itData);
    if (itData.length < stepI) break;
    fromI += stepI;
  }
  const orderItems = allOrderItems;

  console.log(`   - Total líneas de pedido (ítems): ${orderItems.length}`);

  // 4. Agregar demanda por producto
  const demandByProduct = new Map();
  let totalOrderKg = 0;
  orderItems.forEach(item => {
    const qty = Number(item.quantity) || 0;
    totalOrderKg += qty;
    const cur = demandByProduct.get(item.product_id) || { totalQty: 0, count: 0 };
    cur.totalQty += qty;
    cur.count += 1;
    demandByProduct.set(item.product_id, cur);
  });

  console.log(`   - SKUs únicos demandados en pedidos: ${demandByProduct.size}`);
  console.log(`   - Volumen total demandado: ${totalOrderKg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} Kg/Un`);

  // 5. Cruzar Demanda vs Excel
  let skusInExcel = 0;
  let skusNotInExcel = 0;
  let totalStockAvailableForDemand = 0;
  let totalNetPurchaseRequired = 0;
  let fullyCoveredByStockCount = 0;
  let partiallyCoveredCount = 0;
  let zeroStockCount = 0;

  const comparisonRows = [];

  demandByProduct.forEach((dem, prodId) => {
    const prod = productById.get(prodId);
    const prodName = prod ? prod.name : 'Desconocido';
    const accId = prod ? prod.accounting_id : null;

    let excelStock = 0;
    let inExcel = false;
    let hasDups = false;

    if (accId && excelRowsByAccId.has(Number(accId))) {
      inExcel = true;
      skusInExcel++;
      const rows = excelRowsByAccId.get(Number(accId));
      if (rows.length > 1) hasDups = true;
      // Tomamos el stock de bodega de la última ocurrencia o la primera
      // Analizaremos ambas opciones
      excelStock = rows[0].stockBodega;
    } else {
      skusNotInExcel++;
    }

    const demandQty = dem.totalQty;
    const netPurchase = Math.max(0, demandQty - excelStock);
    const stockUsed = Math.min(demandQty, excelStock);

    totalStockAvailableForDemand += excelStock;
    totalNetPurchaseRequired += netPurchase;

    if (excelStock >= demandQty) fullyCoveredByStockCount++;
    else if (excelStock > 0) partiallyCoveredCount++;
    else zeroStockCount++;

    comparisonRows.push({
      prodId,
      prodName,
      accId,
      demandQty,
      excelStock,
      netPurchase,
      stockUsed,
      inExcel,
      hasDups
    });
  });

  console.log(`\n4. CRUCE DEMANDA PEDIDOS VS INVENTARIO EXCEL:`);
  console.log(`   - SKUs pedidos presentes en el Excel: ${skusInExcel} de ${demandByProduct.size} (${((skusInExcel/demandByProduct.size)*100).toFixed(1)}%)`);
  console.log(`   - SKUs pedidos AUSENTES del Excel: ${skusNotInExcel}`);
  console.log(`   - SKUs cubiertos 100% por stock en bodega (compra = 0): ${fullyCoveredByStockCount}`);
  console.log(`   - SKUs con cobertura parcial (compra = demanda - stock): ${partiallyCoveredCount}`);
  console.log(`   - SKUs con stock cero o sin inventario (compra = 100% demanda): ${zeroStockCount}`);
  console.log(`   - Demanda Bruta Total: ${totalOrderKg.toFixed(1)} Kg`);
  console.log(`   - Compra Neta estimada para Corabastos: ${totalNetPurchaseRequired.toFixed(1)} Kg`);
  console.log(`   - Ahorro / Despacho desde Bodega: ${(totalOrderKg - totalNetPurchaseRequired).toFixed(1)} Kg`);

  // Mostrar top 10 productos con mayor cobertura y mayor compra
  comparisonRows.sort((a,b) => b.demandQty - a.demandQty);
  console.log(`\n5. TOP 10 PRODUCTOS CON MAYOR DEMANDA Y SU COMPORTAMIENTO:`);
  comparisonRows.slice(0, 10).forEach(r => {
    console.log(`   * ${r.prodName} (ID Contable: ${r.accId}): Demanda=${r.demandQty.toFixed(1)} | Stock Bodega=${r.excelStock.toFixed(1)} | Compra Neta=${r.netPurchase.toFixed(1)} | En Excel? ${r.inExcel ? 'SÍ' : 'NO'}`);
  });
}

runAudit().catch(err => {
  console.error('Error en auditoría:', err);
  process.exit(1);
});
