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

async function audit() {
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

  // Agrupar por Cliente/Sucursal en Excel y en Plataforma
  console.log('--- RECUENTO POR CLIENTES / SUCURSALES ---');

  // Colsubsidio
  console.log('\nCOLSUBSIDIO:');
  console.log(' Excel (' + excelRows.filter(e => e.cliente.includes('COLSUBSIDIO')).length + '):');
  excelRows.filter(e => e.cliente.includes('COLSUBSIDIO')).forEach(e => console.log(`   No. ${e.num} | ${e.doc} | ${e.sucursal} -> $${e.total}`));
  console.log(' Plataforma (' + plat.filter(p => p.company.includes('COLSUBSIDIO')).length + '):');
  plat.filter(p => p.company.includes('COLSUBSIDIO')).forEach(p => console.log(`   Seq #${p.seq} | ${p.company} -> $${p.total} | PO: ${p.po}`));

  // WOK (Lao Kao)
  console.log('\nLAO KAO / WOK:');
  console.log(' Excel (' + excelRows.filter(e => e.cliente.includes('LAO KAO')).length + '):');
  excelRows.filter(e => e.cliente.includes('LAO KAO')).forEach(e => console.log(`   No. ${e.num} | ${e.doc} | ${e.sucursal} -> $${e.total}`));
  console.log(' Plataforma (' + plat.filter(p => p.company.includes('LAO KAO')).length + '):');
  plat.filter(p => p.company.includes('LAO KAO')).forEach(p => console.log(`   Seq #${p.seq} | ${p.company} -> $${p.total}`));

  // YANUBA / MILSEN
  console.log('\nYANUBA / MILSEN:');
  console.log(' Excel (' + excelRows.filter(e => e.cliente.includes('MILSEN')).length + '):');
  excelRows.filter(e => e.cliente.includes('MILSEN')).forEach(e => console.log(`   No. ${e.num} | ${e.doc} | ${e.sucursal} -> $${e.total}`));
  console.log(' Plataforma (' + plat.filter(p => p.company.includes('YANUBA') || p.company.includes('MILSEN')).length + '):');
  plat.filter(p => p.company.includes('YANUBA') || p.company.includes('MILSEN')).forEach(p => console.log(`   Seq #${p.seq} | ${p.company} -> $${p.total}`));

  // HOTEL CAPITAL / HOTELES EL SALITRE
  console.log('\nHOTEL CAPITAL:');
  console.log(' Excel (' + excelRows.filter(e => e.cliente.includes('SALITRE')).length + '):');
  excelRows.filter(e => e.cliente.includes('SALITRE')).forEach(e => console.log(`   No. ${e.num} | ${e.doc} | ${e.sucursal} -> $${e.total}`));
  console.log(' Plataforma (' + plat.filter(p => p.company.includes('SALITRE') || p.company.includes('CAPITAL')).length + '):');
  plat.filter(p => p.company.includes('SALITRE') || p.company.includes('CAPITAL')).forEach(p => console.log(`   Seq #${p.seq} | ${p.company} -> $${p.total}`));

  // DIPLOMAT (WYNDHAM Y TRYP)
  console.log('\nDIPLOMAT (WYNDHAM / TRYP):');
  console.log(' Excel (' + excelRows.filter(e => e.cliente.includes('DIPLOMAT')).length + '):');
  excelRows.filter(e => e.cliente.includes('DIPLOMAT')).forEach(e => console.log(`   No. ${e.num} | ${e.doc} | ${e.sucursal} -> $${e.total}`));
  console.log(' Plataforma (' + plat.filter(p => p.company.includes('DIPLOMAT') || p.company.includes('TRYP') || p.company.includes('WYNDHAM')).length + '):');
  plat.filter(p => p.company.includes('DIPLOMAT') || p.company.includes('TRYP') || p.company.includes('WYNDHAM')).forEach(p => console.log(`   Seq #${p.seq} | ${p.company} -> $${p.total}`));

  // SARASTI / HOTEL BOGOTA CLL 100
  console.log('\nSARASTI (HOTEL BOGOTA CLL 100):');
  console.log(' Excel (' + excelRows.filter(e => e.cliente.includes('SARASTI')).length + '):');
  excelRows.filter(e => e.cliente.includes('SARASTI')).forEach(e => console.log(`   No. ${e.num} | ${e.doc} | ${e.sucursal} -> $${e.total}`));
  console.log(' Plataforma (' + plat.filter(p => p.company.includes('SARASTI') || p.company.includes('100')).length + '):');
  plat.filter(p => p.company.includes('SARASTI') || p.company.includes('100')).forEach(p => console.log(`   Seq #${p.seq} | ${p.company} -> $${p.total}`));
}

audit().catch(console.error);
