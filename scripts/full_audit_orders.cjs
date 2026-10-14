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

async function fullAudit() {
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const excelRows = [];
  for (let i = 2; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || r[0] === undefined || r[0] === null) continue;
    excelRows.push({
      num: Number(r[0]),
      tipo: r[1],
      doc: String(r[2] || '').trim(),
      cliente: String(r[3] || '').trim(),
      sucursal: String(r[4] || '').trim(),
      espacio: r[5],
      total: parseFloat(r[6]) || 0,
      pagar: parseFloat(r[9]) || 0,
      celular: String(r[10] || '').trim(),
      direccion: String(r[11] || '').trim(),
      zona: r[15]
    });
  }

  const rawSnap = fs.readFileSync('backups/orders_78_oct6_snapshot.json', 'utf-8');
  const snapData = JSON.parse(rawSnap);
  const snapOrders = snapData.orders;
  const snapItems = snapData.orderItems || [];

  const profIds = [...new Set(snapOrders.map(o => o.profile_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, nit, address, phone')
    .in('id', profIds);
  const profMap = new Map();
  profiles.forEach(p => profMap.set(p.id, p));

  const platformOrders = snapOrders.map((o) => {
    const p = profMap.get(o.profile_id) || {};
    const items = snapItems.filter(i => i.order_id === o.id);
    return {
      id: o.id,
      seq: o.sequence_id,
      company: p.company_name || p.contact_name || '',
      total: Number(o.total) || 0,
      address: o.shipping_address || p.address || '',
      notes: o.admin_notes || '',
      po: o.purchase_order_number || '',
      itemCount: items.length,
      createdAt: o.created_at
    };
  });

  // Intentemos emparejar manualmente y reportar el estado de cada uno de los 78 pedidos de Excel
  const usedPlatformIds = new Set();
  const report = [];

  for (const e of excelRows) {
    // Buscar la mejor coincidencia en platformOrders
    let candidates = platformOrders.filter(p => !usedPlatformIds.has(p.id));

    // 1. Coincidencia por documento en notas
    let match = candidates.find(p => p.notes && p.notes.toLowerCase().includes(e.doc.toLowerCase()));

    // 2. Coincidencia por total exacto y nombre similar
    if (!match) {
      match = candidates.find(p => {
        const diff = Math.abs(p.total - e.total);
        if (diff > 5) return false;
        const eStr = (e.cliente + ' ' + e.sucursal).toLowerCase();
        const pStr = (p.company + ' ' + p.address).toLowerCase();
        const words = eStr.split(/\s+/).filter(w => w.length > 3 && !['hotel', 'restaurante', 'sede', 'para', 'caja', 'compensacion'].includes(w));
        return words.some(w => pStr.includes(w));
      });
    }

    // 3. Coincidencia por nombre muy específico y total cercano
    if (!match) {
      match = candidates.find(p => {
        const eSuc = e.sucursal.toLowerCase().trim();
        const pComp = p.company.toLowerCase().trim();
        if (eSuc.length > 4 && (pComp.includes(eSuc) || eSuc.includes(pComp))) {
          return true;
        }
        return false;
      });
    }

    if (match) {
      usedPlatformIds.add(match.id);
      report.push({ excel: e, plat: match, matchType: 'MATCH' });
    } else {
      report.push({ excel: e, plat: null, matchType: 'UNMATCHED_EXCEL' });
    }
  }

  const unMatchedPlat = platformOrders.filter(p => !usedPlatformIds.has(p.id));

  console.log(`Emparejados: ${report.filter(r => r.plat).length} de 78.`);
  console.log(`Excel sin match: ${report.filter(r => !r.plat).length}`);
  console.log(`Plataforma sobrantes: ${unMatchedPlat.length}\n`);

  console.log('--- DETALLE DE PEDIDOS EN PLATAFORMA SIN MATCH EN EXCEL ---');
  unMatchedPlat.forEach(p => {
    console.log(`Seq #${p.seq} | Total: $${p.total.toLocaleString('es-CO')} | ${p.company}`);
    console.log(`  Creado: ${p.createdAt} | Items: ${p.itemCount}`);
    console.log(`  Dir: ${p.address}`);
    console.log(`  Notas: ${p.notes.substring(0, 100)}...`);
    console.log('----------------------------------------------------');
  });

  console.log('\n--- DETALLE DE FILAS EN EXCEL SIN MATCH EN PLATAFORMA ---');
  report.filter(r => !r.plat).forEach(r => {
    const e = r.excel;
    console.log(`No. ${e.num} | Doc: ${e.doc} | Total: $${e.total.toLocaleString('es-CO')}`);
    console.log(`  Cliente: "${e.cliente}" | Sucursal: "${e.sucursal}"`);
    console.log(`  Dir: "${e.direccion}"`);
    console.log('----------------------------------------------------');
  });
}

fullAudit().catch(console.error);
