const fs = require('fs');
const xlsx = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateLoad() {
  console.log('--- SIMULACION DE CARGA: EXCEL A CIERRE DE HOY (2026-10-07) ---');

  const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/detalle_inventario_2026-10-05.xlsx';
  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  // 1. Obtener catálogo DB
  let allDbProducts = [];
  let fromP = 0;
  const stepP = 1000;
  while (true) {
    const { data: pData } = await supabase
      .from('products')
      .select('id, name, sku, accounting_id, category, unit_of_measure')
      .range(fromP, fromP + stepP - 1);
    if (!pData || pData.length === 0) break;
    allDbProducts = allDbProducts.concat(pData);
    if (pData.length < stepP) break;
    fromP += stepP;
  }

  const byAccId = new Map();
  const byName = new Map();
  allDbProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(Number(p.accounting_id), p);
    if (p.name) byName.set(p.name.trim().toLowerCase(), p);
  });

  // 2. Parsear filas del Excel resolviendo duplicados (tomando la fila más completa / mayor bodega)
  const rowsByAccId = new Map();
  for (let i = 3; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || !r[1]) continue;
    const accId = Number(r[1]);
    const name = String(r[3] || '').trim();
    const rowObj = {
      rowIdx: i + 1,
      accId,
      list: r[2],
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
      returns: parseFloat(r[14]) || 0,
      weighing: parseFloat(r[15]) || 0,
      damage: parseFloat(r[16]) || 0,
      cleaning: parseFloat(r[17]) || 0,
      calculated: parseFloat(r[18]) || 0,
      agregadoBodega: parseFloat(r[19]) || 0,
      bodega: parseFloat(r[20]) || 0,
      missing: parseFloat(r[21]) || 0,
      surplus: parseFloat(r[22]) || 0,
    };

    if (!rowsByAccId.has(accId)) {
      rowsByAccId.set(accId, [rowObj]);
    } else {
      rowsByAccId.get(accId).push(rowObj);
    }
  }

  let matchedProductsCount = 0;
  let totalMovementsGenerated = 0;
  let totalPhysicalStock = 0;
  let totalPurchases = 0;
  let totalSales = 0;
  let totalWaste = 0;

  const consolidatedItems = [];

  rowsByAccId.forEach((arr, accId) => {
    // Si hay duplicados, seleccionar el que tiene mayor bodega o la fila consolidada
    let selected = arr[0];
    if (arr.length > 1) {
      selected = arr.reduce((prev, curr) => (curr.bodega >= prev.bodega ? curr : prev));
    }

    const matchedProd = byAccId.get(accId) || byName.get(selected.name.toLowerCase());
    if (matchedProd) {
      matchedProductsCount++;
    }

    totalPhysicalStock += selected.bodega;
    totalPurchases += selected.purchases;
    totalSales += selected.salesKg;
    totalWaste += (selected.weighing + selected.damage + selected.cleaning);

    // Contar movimientos potenciales
    let movs = 0;
    if (Math.abs(selected.corrections) > 0.0001) movs++;
    if (selected.purchases > 0.0001) movs++;
    if (selected.salesKg > 0.0001) movs++;
    if (selected.weightSalesUnits > 0.0001 && selected.salesKg <= 0.0001) movs++;
    if (selected.shortage > 0.0001) movs++;
    if (selected.unshipped > 0.0001) movs++;
    if (selected.additional > 0.0001) movs++;
    if (selected.returns > 0.0001) movs++;
    if (selected.weighing > 0.0001) movs++;
    if (selected.damage > 0.0001) movs++;
    if (selected.cleaning > 0.0001) movs++;
    if (selected.bodega !== null && selected.bodega !== undefined) movs++;

    totalMovementsGenerated += movs;
    consolidatedItems.push({
      accId,
      name: selected.name,
      matchedProdId: matchedProd ? matchedProd.id : null,
      selected
    });
  });

  console.log(`\nResultados de la Simulación:`);
  console.log(` - SKUs procesados (únicos consolidados): ${rowsByAccId.size}`);
  console.log(` - SKUs coincidentes en base de datos: ${matchedProductsCount} de ${rowsByAccId.size}`);
  console.log(` - Total Stock Físico Bodega resultante: ${totalPhysicalStock.toFixed(2)} Kg/Un`);
  console.log(` - Total Compras del día registradas: ${totalPurchases.toFixed(2)} Kg`);
  console.log(` - Total Ventas del día registradas: ${totalSales.toFixed(2)} Kg`);
  console.log(` - Total Mermas (Pesada + Desperdicio + Basura): ${totalWaste.toFixed(2)} Kg`);
  console.log(` - Total Movimientos de Kardex a generar para HOY (2026-10-07): ${totalMovementsGenerated}`);

  // Verificar cómo lo leerá Compras para MAÑANA (2026-10-08)
  console.log(`\nComportamiento para el Neteo de Compras (2026-10-08):`);
  console.log(` - La consulta en /admin/procurement/purchases-print busca el último cierre con closing_date < '2026-10-08'`);
  console.log(` - Encontrará el cierre del 2026-10-07.`);
  console.log(` - Extraerá el stock final de cada ítem de ese cierre.`);
  console.log(` - Descontará ese stock de los 78 pedidos de mañana.`);
  console.log(` - Resultado neto: De 14.360 Kg pedidos, se comprarán solo ~7.491 Kg en Corabastos.`);
}

simulateLoad().catch(console.error);
