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

async function findDups() {
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

  console.log('--- BUSCANDO DUPLICADOS EN LA PLATAFORMA ---');
  // Buscar órdenes del mismo cliente con items idénticos o casi idénticos
  const pairs = [];
  for (let i = 0; i < snapOrders.length; i++) {
    for (let j = i + 1; j < snapOrders.length; j++) {
      const o1 = snapOrders[i];
      const o2 = snapOrders[j];
      if (o1.profile_id === o2.profile_id) {
        const items1 = snapItems.filter(it => it.order_id === o1.id);
        const items2 = snapItems.filter(it => it.order_id === o2.id);

        // Si tienen mismo total o mismo número de items
        const sameTotal = Math.abs(o1.total - o2.total) < 10;
        const sameItemCount = items1.length === items2.length && items1.length > 0;

        if (sameTotal || sameItemCount) {
          pairs.push({
            p1: o1,
            p2: o2,
            company: profMap.get(o1.profile_id)?.company_name,
            sameTotal,
            sameItemCount,
            count: items1.length
          });
        }
      }
    }
  }

  console.log(`Pares sospechosos encontrados del mismo cliente: ${pairs.length}`);
  pairs.forEach(pair => {
    console.log(`\nCliente: ${pair.company}`);
    console.log(` Orden A: Seq #${pair.p1.sequence_id} | Total: $${pair.p1.total} | Creado: ${pair.p1.created_at} | Items: ${pair.count}`);
    console.log(`   Notas A: ${pair.p1.admin_notes?.substring(0, 80)}`);
    console.log(` Orden B: Seq #${pair.p2.sequence_id} | Total: $${pair.p2.total} | Creado: ${pair.p2.created_at} | Items: ${pair.count}`);
    console.log(`   Notas B: ${pair.p2.admin_notes?.substring(0, 80)}`);
  });
}

findDups().catch(console.error);
