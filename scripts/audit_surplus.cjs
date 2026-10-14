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

async function auditSurplus() {
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
      createdAt: o.created_at,
      docUrl: o.document_url || ''
    };
  });

  console.log('Analizando coincidencias por cliente...');

  // Veamos caso por caso de clientes con conteo dispar:
  // 1. EL CORRAL CASTELLANA
  const castellanaPlat = plat.filter(p => p.company.includes('CASTELLANA') || p.notes.includes('Castellana'));
  const castellanaExcel = excelRows.filter(e => e.cliente.includes('CASTELLANA') || e.sucursal.includes('CASTELLANA'));
  console.log(`\nEL CORRAL CASTELLANA:`);
  console.log(` - Plataforma (${castellanaPlat.length} ordenes):`, castellanaPlat.map(p => `Seq #${p.seq} ($${p.total})`).join(', '));
  console.log(` - Excel (${castellanaExcel.length} ordenes):`, castellanaExcel.map(e => `No. ${e.num} ${e.doc} ($${e.total})`).join(', '));

  // 2. CESNE
  const cesnePlat = plat.filter(p => p.company.includes('CESNE'));
  const cesneExcel = excelRows.filter(e => e.cliente.includes('CESNE') || e.sucursal.includes('CESNE'));
  console.log(`\nCESNE:`);
  console.log(` - Plataforma (${cesnePlat.length} ordenes):`, cesnePlat.map(p => `Seq #${p.seq} ($${p.total})`).join(', '));
  console.log(` - Excel (${cesneExcel.length} ordenes):`, cesneExcel.map(e => `No. ${e.num} ${e.doc} ($${e.total})`).join(', '));

  // 3. HOTEL CALLE 94 (CHICO)
  const c94Plat = plat.filter(p => p.company.includes('94') || p.notes.includes('Chico') || p.address.includes('94'));
  const c94Excel = excelRows.filter(e => e.cliente.includes('94') || e.sucursal.includes('94') || e.sucursal.includes('CHICO'));
  console.log(`\nHOTEL CALLE 94 / CHICO:`);
  console.log(` - Plataforma (${c94Plat.length} ordenes):`, c94Plat.map(p => `Seq #${p.seq} ($${p.total}) [${p.company}]`).join(', '));
  console.log(` - Excel (${c94Excel.length} ordenes):`, c94Excel.map(e => `No. ${e.num} ${e.doc} ($${e.total}) [${e.sucursal}]`).join(', '));

  // 4. COLSUBSIDIO EL CUBO
  const cuboPlat = plat.filter(p => p.company.includes('EL CUBO'));
  const cuboExcel = excelRows.filter(e => e.sucursal.includes('EL CUBO'));
  console.log(`\nCOLSUBSIDIO EL CUBO:`);
  console.log(` - Plataforma (${cuboPlat.length} ordenes):`, cuboPlat.map(p => `Seq #${p.seq} ($${p.total})`).join(', '));
  console.log(` - Excel (${cuboExcel.length} ordenes):`, cuboExcel.map(e => `No. ${e.num} ${e.doc} ($${e.total})`).join(', '));

  // 5. COLSUBSIDIO CATERING
  const catPlat = plat.filter(p => p.company.includes('CATERING'));
  const catExcel = excelRows.filter(e => e.sucursal.includes('CATERING'));
  console.log(`\nCOLSUBSIDIO CATERING:`);
  console.log(` - Plataforma (${catPlat.length} ordenes):`, catPlat.map(p => `Seq #${p.seq} ($${p.total})`).join(', '));
  console.log(` - Excel (${catExcel.length} ordenes):`, catExcel.map(e => `No. ${e.num} ${e.doc} ($${e.total})`).join(', '));

  // 6. COLSUBSIDIO PISCILAGO
  const pisPlat = plat.filter(p => p.company.includes('PISCILAGO'));
  const pisExcel = excelRows.filter(e => e.sucursal.includes('PISCILAGO'));
  console.log(`\nCOLSUBSIDIO PISCILAGO:`);
  console.log(` - Plataforma (${pisPlat.length} ordenes):`, pisPlat.map(p => `Seq #${p.seq} ($${p.total})`).join(', '));
  console.log(` - Excel (${pisExcel.length} ordenes):`, pisExcel.map(e => `No. ${e.num} ${e.doc} ($${e.total})`).join(', '));
}

auditSurplus().catch(console.error);
