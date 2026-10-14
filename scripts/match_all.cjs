const fs = require('fs');
const xlsx = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const EXCEL_PATH = 'C:/Users/German Higuera/OneDrive/Desktop/relacion_documentos_2026-10-06 (1).xlsx';

async function matchAll() {
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const excelRows = [];
  for (let i = 2; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || r[0] === undefined || r[0] === null) continue;
    excelRows.push({
      num: Number(r[0]),
      doc: String(r[2] || '').trim(),
      cliente: String(r[3] || '').trim(),
      sucursal: String(r[4] || '').trim(),
      total: parseFloat(r[6]) || 0,
      direccion: String(r[11] || '').trim()
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

  const plat = snapOrders.map((o) => {
    const p = profMap.get(o.profile_id) || {};
    return {
      id: o.id,
      seq: o.sequence_id,
      company: p.company_name || p.contact_name || '',
      total: Number(o.total) || 0,
      address: o.shipping_address || p.address || '',
      notes: o.admin_notes || '',
      po: o.purchase_order_number || '',
      createdAt: o.created_at
    };
  });

  // Matriz de emparejamiento manual asistido
  // Asignaciones directas e incuestionables:
  const assignments = []; // { eNum, pSeq, reason }

  // Busquemos matches exactos por documento
  excelRows.forEach(e => {
    const docClean = e.doc.toLowerCase();
    const found = plat.find(p => p.notes && p.notes.toLowerCase().includes(docClean));
    if (found) {
      assignments.push({ eNum: e.num, pSeq: found.seq, reason: 'DOC_MATCH: ' + e.doc });
    }
  });

  console.log(`Paso 1 (Por doc en notas): ${assignments.length} emparejados.`);

  // Busquemos matches por PO number
  excelRows.forEach(e => {
    if (assignments.some(a => a.eNum === e.num)) return;
    const found = plat.find(p => !assignments.some(a => a.pSeq === p.seq) && p.po && (e.doc.includes(p.po) || (p.notes && p.notes.includes(e.doc))));
    if (found) {
      assignments.push({ eNum: e.num, pSeq: found.seq, reason: 'PO_MATCH: ' + found.po });
    }
  });

  // Busquemos matches por cliente + total exacto (o diff < 2)
  excelRows.forEach(e => {
    if (assignments.some(a => a.eNum === e.num)) return;
    const candidates = plat.filter(p => !assignments.some(a => a.pSeq === p.seq));
    const found = candidates.find(p => {
      if (Math.abs(p.total - e.total) > 2) return false;
      const c1 = e.cliente.toLowerCase();
      const s1 = e.sucursal.toLowerCase();
      const c2 = p.company.toLowerCase();
      return c2.includes(s1) || s1.includes(c2) || c2.includes(c1) || c1.includes(c2);
    });
    if (found) {
      assignments.push({ eNum: e.num, pSeq: found.seq, reason: 'EXACT_TOTAL_AND_NAME: $' + e.total });
    }
  });

  console.log(`Paso 2 (Por total exacto y nombre): ${assignments.length} emparejados.`);

  // Busquemos matches por cliente + total cercano (< 5%)
  excelRows.forEach(e => {
    if (assignments.some(a => a.eNum === e.num)) return;
    const candidates = plat.filter(p => !assignments.some(a => a.pSeq === p.seq));
    const found = candidates.find(p => {
      const diffPct = Math.abs(p.total - e.total) / (e.total || 1);
      if (diffPct > 0.08) return false;
      const c1 = e.cliente.toLowerCase();
      const s1 = e.sucursal.toLowerCase();
      const c2 = p.company.toLowerCase();
      const matchName = (s1.length > 4 && c2.includes(s1)) || (c1.length > 5 && c2.includes(c1));
      return matchName;
    });
    if (found) {
      assignments.push({ eNum: e.num, pSeq: found.seq, reason: 'CLOSE_TOTAL_AND_NAME: E$' + e.total + ' vs P$' + found.total });
    }
  });

  console.log(`Paso 3 (Por total cercano y nombre): ${assignments.length} emparejados.`);

  // Ver los no emparejados de ambos lados
  const unassignedExcel = excelRows.filter(e => !assignments.some(a => a.eNum === e.num));
  const unassignedPlat = plat.filter(p => !assignments.some(a => a.pSeq === p.seq));

  console.log(`\nQuedan sin emparejar:`);
  console.log(` - Excel: ${unassignedExcel.length}`);
  console.log(` - Plataforma: ${unassignedPlat.length}`);

  console.log('\n--- DETALLE EXCEL PENDIENTES ---');
  unassignedExcel.forEach(e => {
    console.log(`Excel No. ${e.num} | Doc: ${e.doc} | ${e.cliente} - ${e.sucursal} | Total: $${e.total}`);
  });

  console.log('\n--- DETALLE PLATAFORMA PENDIENTES ---');
  unassignedPlat.forEach(p => {
    console.log(`Plataforma Seq #${p.seq} | Total: $${p.total} | ${p.company} | PO: ${p.po}`);
    console.log(`   Notas: ${p.notes.substring(0, 100)}`);
  });
}

matchAll().catch(console.error);
