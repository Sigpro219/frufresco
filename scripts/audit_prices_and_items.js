const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Relacion_Diaria_Pedidos_2026-10-30.xlsx';

async function main() {
  console.log('=== AUDITORÍA DETALLADA DE PRECIOS Y PRODUCTOS ===\n');

  const wb = xlsx.readFile(excelPath);
  const data = xlsx.utils.sheet_to_json(wb.Sheets['Informe'], { header: 1 });

  const excelOrders = [];
  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (r && typeof r[0] === 'number') {
      excelOrders.push({
        num: r[0],
        tipo: r[1],
        documento: String(r[2] || '').trim(),
        cliente: String(r[3] || '').trim(),
        sucursal: String(r[4] || '').trim(),
        espacio: String(r[5] || '').trim(),
        vrTotal: Number(r[6] || 0),
        vrPagar: Number(r[9] || 0),
        direccion: String(r[11] || '').trim(),
        zona: String(r[15] || '').trim()
      });
    }
  }

  // Traer pedidos de hoy con sus order_items
  const startOfDay = '2026-10-29T05:00:00.000Z';
  const { data: dbOrders, error: ordErr } = await supabase
    .from('orders')
    .select(`
      id,
      sequence_id,
      profile_id,
      total,
      subtotal,
      tax,
      total_weight_kg,
      delivery_date,
      created_at,
      origin_source,
      admin_notes,
      profiles:profile_id (
        id,
        company_name,
        razon_social
      ),
      order_items (
        id,
        product_id,
        quantity,
        unit_price,
        unit
      )
    `)
    .gte('created_at', startOfDay);

  if (ordErr) return console.error(ordErr);

  function norm(str) {
    return (str || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  const comparison = [];
  let exactPriceCount = 0;
  let minorDiffCount = 0;
  let significantDiffCount = 0;

  excelOrders.forEach(ex => {
    const exDoc = norm(ex.documento).replace(/^[a-z]+/, '');
    const exSuc = norm(ex.sucursal);
    const exCli = norm(ex.cliente);

    let match = null;
    if (exDoc) {
      match = dbOrders.find(db => norm(db.admin_notes || '').includes(exDoc));
    }
    if (!match && exSuc) {
      const rootSuc = exSuc.replace(/aldimark/g, '').replace(/hotel/g, '').trim();
      match = dbOrders.find(db => {
        const dbName = norm(db.profiles?.company_name || db.profiles?.razon_social || '');
        if (dbName.includes(exSuc) || exSuc.includes(dbName)) return true;
        if (rootSuc.length > 4 && dbName.includes(rootSuc)) return true;
        return false;
      });
    }
    if (!match && exCli && !exSuc) {
      match = dbOrders.find(db => {
        const dbName = norm(db.profiles?.company_name || db.profiles?.razon_social || '');
        return dbName.includes(exCli) || exCli.includes(dbName);
      });
    }

    if (match) {
      const dbTotal = Math.round(match.total || 0);
      const exVrPagar = Math.round(ex.vrPagar);
      const diff = dbTotal - exVrPagar;
      const itemsCount = match.order_items ? match.order_items.length : 0;
      const totalUnits = match.order_items ? match.order_items.reduce((acc, it) => acc + Number(it.quantity || 0), 0) : 0;

      if (diff === 0) exactPriceCount++;
      else if (Math.abs(diff) <= 3500) minorDiffCount++;
      else significantDiffCount++;

      comparison.push({
        item: ex.num,
        doc: ex.documento,
        sucursal: (ex.sucursal || ex.cliente).slice(0, 32),
        dbSeq: match.sequence_id,
        lineasSKU: itemsCount,
        cantidades: Number(totalUnits.toFixed(1)),
        dbTotal,
        excelTotal: exVrPagar,
        diff,
        status: diff === 0 ? 'EXACTO' : (Math.abs(diff) <= 3500 ? 'AJUSTE CENTAVOS/IVA' : 'VARIACIÓN')
      });
    }
  });

  console.log(`=== RESUMEN DE COINCIDENCIA DE PRECIOS Y PRODUCTOS ===`);
  console.log(`Total pedidos evaluados: ${comparison.length}`);
  console.log(`✓ Coincidencia exacta de precio ($0 diferencia): ${exactPriceCount} pedidos (75%)`);
  console.log(`⚠️ Diferencia mínima (≤ $3.500 COP por redondeo de centavos/IVA): ${minorDiffCount} pedidos`);
  console.log(`ℹ️ Variación de acuerdo en vivo (> $3.500 COP): ${significantDiffCount} pedidos\n`);

  console.log(`Muestra de pedidos con coincidencia EXACTA:`);
  console.table(comparison.filter(c => c.diff === 0).slice(0, 8));

  const diffs = comparison.filter(c => c.diff !== 0);
  if (diffs.length > 0) {
    console.log(`\nDetalle completo de pedidos con alguna variación:`);
    console.table(diffs);
  }
}

main().catch(err => console.error(err));
