const fs = require('fs');
const xlsx = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const EXCEL_PATH = 'C:/Users/German Higuera/OneDrive/Desktop/relacion_documentos_2026-10-06 (1).xlsx';

async function crossCheck() {
  console.log('=== CRUCE: EXCEL VS PLATAFORMA ===\n');

  // 1. Cargar Excel
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const excelOrders = [];
  for (let i = 2; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || r[0] === undefined || r[0] === null) continue;
    excelOrders.push({
      rowIdx: i + 1,
      num: r[0],
      tipo: r[1],
      documento: String(r[2] || '').trim(),
      cliente: String(r[3] || '').trim(),
      sucursal: String(r[4] || '').trim(),
      espacio: r[5],
      total: parseFloat(r[6]) || 0,
      pagar: parseFloat(r[9]) || 0,
      celular: String(r[10] || '').trim(),
      direccion: String(r[11] || '').trim(),
      formaPago: r[12],
      zona: r[15]
    });
  }

  console.log(`1. EXCEL: ${excelOrders.length} pedidos encontrados.`);
  console.log(`   Rango No.: ${excelOrders[0].num} hasta ${excelOrders[excelOrders.length - 1].num}`);

  // 2. Cargar Pedidos de la Plataforma (2026-10-08)
  const { data: dbOrders, error: oErr } = await supabase
    .from('orders')
    .select(`
      id, profile_id, total, status, type, delivery_date, shipping_address,
      admin_notes, special_notes, sequence_id, invoice_id, purchase_order_number,
      warehouse_spaces, total_weight_kg
    `)
    .eq('delivery_date', '2026-10-08');
  if (oErr) throw oErr;

  console.log(`2. PLATAFORMA: ${dbOrders.length} pedidos encontrados en fecha 2026-10-08.`);

  // Cargar perfiles de esos pedidos
  const profileIds = [...new Set(dbOrders.map(o => o.profile_id).filter(Boolean))];
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, nit, address, phone')
    .in('id', profileIds);
  if (pErr) throw pErr;

  const profileMap = new Map();
  profiles.forEach(p => profileMap.set(p.id, p));

  const platformOrders = dbOrders.map(o => {
    const prof = profileMap.get(o.profile_id) || {};
    return {
      id: o.id,
      profile_id: o.profile_id,
      company: prof.company_name || prof.contact_name || '',
      nit: prof.nit || '',
      phone: prof.phone || '',
      total: Number(o.total) || 0,
      address: o.shipping_address || prof.address || '',
      sequenceId: o.sequence_id,
      invoiceId: o.invoice_id,
      poNumber: o.purchase_order_number,
      notes: o.admin_notes || o.special_notes || '',
      spaces: o.warehouse_spaces,
      weight: o.total_weight_kg
    };
  });

  console.log(`\n3. ANALISIS COMPARATIVO:\n`);

  // Intentar emparejar cada pedido de la plataforma con uno del Excel
  const matchedExcelIndices = new Set();
  const matchedPlatformIndices = new Set();

  platformOrders.forEach((po, pIdx) => {
    // Criterios de emparejamiento:
    // 1. Coincidencia exacta o cercana en total monetario (+/- 100 pesos) y nombre de empresa/sucursal
    let bestMatch = -1;

    for (let eIdx = 0; eIdx < excelOrders.length; eIdx++) {
      if (matchedExcelIndices.has(eIdx)) continue;
      const eo = excelOrders[eIdx];

      const diffTotal = Math.abs(po.total - eo.total);
      const diffPagar = Math.abs(po.total - eo.pagar);

      const compLower = po.company.toLowerCase();
      const excelClientLower = (eo.cliente + ' ' + eo.sucursal).toLowerCase();

      // Check document / invoice match
      const docMatch = (po.invoiceId && eo.documento.includes(po.invoiceId)) ||
                       (po.sequenceId && eo.documento.includes(String(po.sequenceId))) ||
                       (po.notes && po.notes.includes(eo.documento));

      // Si el total coincide exactamente (o diff < 2)
      if (diffTotal < 2 || diffPagar < 2) {
        // Verificar si los nombres tienen alguna palabra en común
        const words = excelClientLower.split(/\s+/).filter(w => w.length > 3);
        const hasCommonWord = words.some(w => compLower.includes(w));
        if (hasCommonWord || docMatch) {
          bestMatch = eIdx;
          break;
        }
      }
    }

    if (bestMatch !== -1) {
      matchedPlatformIndices.add(pIdx);
      matchedExcelIndices.add(bestMatch);
    }
  });

  console.log(`Emparejados con éxito: ${matchedPlatformIndices.size} pedidos.`);

  // Pedidos en plataforma que NO hicieron match
  const unmatchedPlatform = platformOrders.filter((_, idx) => !matchedPlatformIndices.has(idx));
  const unmatchedExcel = excelOrders.filter((_, idx) => !matchedExcelIndices.has(idx));

  console.log(`Pedidos en Plataforma sin match en Excel: ${unmatchedPlatform.length}`);
  console.log(`Pedidos en Excel sin match en Plataforma: ${unmatchedExcel.length}\n`);

  if (unmatchedPlatform.length > 0) {
    console.log('--- PEDIDOS SOBRANTES EN LA PLATAFORMA ---');
    unmatchedPlatform.forEach(p => {
      console.log(`ID: ${p.id}`);
      console.log(` Cliente/Empresa: "${p.company}" | Comercial: "${p.commercialName}" | Sucursal: "${p.branchName}"`);
      console.log(` Total: $${p.total.toLocaleString('es-CO')} | Dirección: "${p.address}"`);
      console.log(` Invoice/Sec: "${p.invoiceId || ''}" / "${p.sequenceId || ''}" | PO: "${p.poNumber || ''}"`);
      console.log(` Notas: "${p.notes}"`);
      console.log('--------------------------------------------------');
    });
  }

  if (unmatchedExcel.length > 0) {
    console.log('\n--- PEDIDOS EN EXCEL QUE NO HICIERON MATCH DIRECTO ---');
    unmatchedExcel.forEach(e => {
      console.log(`No. ${e.num} | Doc: "${e.documento}" | Cliente: "${e.cliente}" | Sucursal: "${e.sucursal}" | Total: $${e.total.toLocaleString('es-CO')}`);
    });
  }
}

crossCheck().catch(console.error);
