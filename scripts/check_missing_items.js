const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const dir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre';
const files = [
  { file: 'COLEGIO SAN JORGE.xlsx', templateId: '9a58514a-a4a8-40a3-b86b-8ff401205782', name: 'COLEGIO SAN JORGE' },
  { file: 'CORFERIAS-OCT.xlsx', templateId: 'd58c8789-219b-4aa5-9658-ae2752af4b71', name: 'CORFERIAS' },
  { file: 'LA MONTAÑA.xlsx', templateId: 'f10f2e31-49b6-4b7c-a396-5d83d39a8197', name: 'LA MONTAÑA' }
];

async function checkMissingItems() {
  // Load products
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('products').select('id, accounting_id, name').range(from, from + 999);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const byAccId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(String(p.accounting_id).trim(), p);
  });

  for (const f of files) {
    const { data: existingItems } = await supabase
      .from('quote_template_items')
      .select('product_id')
      .eq('template_id', f.templateId);

    const existingSet = new Set((existingItems || []).map(i => i.product_id));

    const wb = xlsx.readFile(path.join(dir, f.file));
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    const missingInTemplate = [];
    rows.forEach(r => {
      const accId = String(r.idProducto || '').trim();
      const p = byAccId.get(accId);
      if (p && !existingSet.has(p.id)) {
        missingInTemplate.push({ template_id: f.templateId, product_id: p.id, name: p.name });
      }
    });

    console.log(`=== ${f.name} ===`);
    console.log(`Current items in template: ${existingSet.size}`);
    console.log(`Items in Excel: ${rows.length}`);
    console.log(`Missing items to insert: ${missingInTemplate.length}`);
    if (missingInTemplate.length > 0) {
      console.log(`Sample missing:`, missingInTemplate.slice(0, 3).map(m => m.name));
    }
  }
}

checkMissingItems();
