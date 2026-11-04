const xlsx = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adicionalesDir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales';

async function checkMissingProds() {
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('products').select('id, name, accounting_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const byAccId = new Map();
  const byName = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(String(p.accounting_id).trim(), p);
    byName.set(p.name.toLowerCase().trim(), p);
  });

  const filesToCheck = [
    'anglo colombiano mensual.xlsx',
    'capital mensual.xlsx',
    'cesap mensual.xlsx',
    'yanuba semanal.xlsx',
    'wok restaurante mensual.xlsx'
  ];

  for (const f of filesToCheck) {
    const wb = xlsx.readFile(path.join(adicionalesDir, f));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const header = raw[0];
    const rows = raw.slice(1).filter(r => r && r[0] !== undefined);

    const missing = [];
    rows.forEach(r => {
      const accId = String(r[0] || '').trim();
      const pName = String(r[1] || '').trim();
      if (!byAccId.has(accId)) {
        const foundByName = byName.get(pName.toLowerCase());
        missing.push({
          idExcel: accId,
          nombreExcel: pName,
          precio: r[2],
          encontradoPorNombre: foundByName ? `${foundByName.name} (ID: ${foundByName.accounting_id})` : 'NO EXISTE EN CATÁLOGO'
        });
      }
    });

    console.log(`=== ${f} (Faltantes sin match directo por ID: ${missing.length}) ===`);
    console.table(missing);
  }
}

checkMissingProds().catch(err => console.error(err));
