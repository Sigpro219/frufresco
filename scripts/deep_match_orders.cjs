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

async function deepMatch() {
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
      total: parseFloat(r[6]) || 0,
      direccion: String(r[11] || '').trim(),
    });
  }

  const rawSnap = fs.readFileSync('backups/orders_78_oct6_snapshot.json', 'utf-8');
  const snapData = JSON.parse(rawSnap);
  const snapOrders = snapData.orders;
  const snapItems = snapData.orderItems || [];

  // Cargar perfiles
  const profIds = [...new Set(snapOrders.map(o => o.profile_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, nit, address, phone')
    .in('id', profIds);
  const profMap = new Map();
  profiles.forEach(p => profMap.set(p.id, p));

  console.log('Total Excel rows:', excelRows.length);
  console.log('Total Platform orders:', snapOrders.length);

  // Mapear cada orden de la plataforma
  const plat = snapOrders.map(o => {
    const p = profMap.get(o.profile_id) || {};
    const items = snapItems.filter(it => it.order_id === o.id);
    return {
      id: o.id,
      seq: o.sequence_id,
      company: p.company_name || p.contact_name || '',
      total: Number(o.total) || 0,
      subtotal: Number(o.subtotal) || 0,
      address: o.shipping_address || p.address || '',
      notes: o.admin_notes || '',
      po: o.purchase_order_number || '',
      itemCount: items.length,
      items: items.map(it => ({ qty: it.quantity, price: it.unit_price }))
    };
  });

  // Imprimir lista completa de empresas y totales en plataforma vs Excel para ver el 1 a 1
  plat.sort((a,b) => b.total - a.total);
  excelRows.sort((a,b) => b.total - a.total);

  console.log('\nTop 20 en Plataforma:');
  plat.slice(0, 20).forEach((p, i) => {
    console.log(`${i+1}. [Seq ${p.seq}] ${p.company} -> $${p.total.toLocaleString('es-CO')} (${p.itemCount} items)`);
  });

  console.log('\nTop 20 en Excel:');
  excelRows.slice(0, 20).forEach((e, i) => {
    console.log(`${i+1}. [No. ${e.num}] ${e.doc} | ${e.cliente} - ${e.sucursal} -> $${e.total.toLocaleString('es-CO')}`);
  });
}

deepMatch().catch(console.error);
