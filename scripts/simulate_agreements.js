const xlsx = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const dir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre';
const files = [
  { file: 'COLEGIO SAN JORGE.xlsx', templateId: '9a58514a-a4a8-40a3-b86b-8ff401205782', name: 'COLEGIO SAN JORGE' },
  { file: 'CORFERIAS-OCT.xlsx', templateId: 'd58c8789-219b-4aa5-9658-ae2752af4b71', name: 'CORFERIAS' },
  { file: 'LA MONTAÑA.xlsx', templateId: 'f10f2e31-49b6-4b7c-a396-5d83d39a8197', name: 'LA MONTAÑA' }
];

async function simulate() {
  // 1. Fetch all products
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('products').select('id, name, accounting_id, parent_id, unit_of_measure').range(from, from + 999);
    if (error || !data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const byAccId = new Map();
  const byId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(String(p.accounting_id).trim(), p);
    byId.set(p.id, p);
  });

  // 2. Fetch commercial_cost_matrix
  const { data: ccm } = await supabase.from('commercial_cost_matrix').select('product_id, base_cost, purchase_unit');
  const ccmMap = new Map();
  (ccm || []).forEach(c => {
    if (c.base_cost > 0) ccmMap.set(c.product_id, Number(c.base_cost));
  });

  // 3. Fetch purchase history normalized
  const { data: phn } = await supabase.from('purchase_history_normalized').select('product_id, normalized_price, unit_price').order('created_at', { ascending: false });
  const phnMap = new Map();
  (phn || []).forEach(p => {
    const cost = Number(p.normalized_price || p.unit_price || 0);
    if (cost > 0 && !phnMap.has(p.product_id)) phnMap.set(p.product_id, cost);
  });

  // Cost resolver
  function getCost(prodId) {
    if (ccmMap.has(prodId)) return ccmMap.get(prodId);
    if (phnMap.has(prodId)) return phnMap.get(prodId);
    const prod = byId.get(prodId);
    if (prod && prod.parent_id) {
      if (ccmMap.has(prod.parent_id)) return ccmMap.get(prod.parent_id);
      if (phnMap.has(prod.parent_id)) return phnMap.get(prod.parent_id);
    }
    return 0;
  }

  for (const f of files) {
    const wb = xlsx.readFile(path.join(dir, f.file));
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let matched = 0, withCost = 0, zeroCost = 0;
    let minMargin = Infinity, maxMargin = -Infinity;
    const samples = [];

    rows.forEach(r => {
      const accId = String(r.idProducto || '').trim();
      const p = byAccId.get(accId);
      if (p) {
        matched++;
        const cost = getCost(p.id);
        const excelPrice = Number(r.Precio || 0);
        if (cost > 0) {
          withCost++;
          const m = Number((((excelPrice - cost) / cost) * 100).toFixed(2));
          if (m < minMargin) minMargin = m;
          if (m > maxMargin) maxMargin = m;
          if (samples.length < 3) {
            samples.push({ idProducto: accId, name: p.name, excelPrice, cost, margin: m });
          }
        } else {
          zeroCost++;
          if (samples.length < 3) {
            samples.push({ idProducto: accId, name: p.name, excelPrice, cost: 0, margin: 0 });
          }
        }
      }
    });

    console.log(`\n=== ${f.name} ===`);
    console.log(`Rows in Excel: ${rows.length}`);
    console.log(`Matched products: ${matched}`);
    console.log(`Products with cost > 0: ${withCost}`);
    console.log(`Products without cost: ${zeroCost}`);
    console.log(`Margin range: ${minMargin}% to ${maxMargin}%`);
    console.log(`Samples:`, samples);
  }
}
simulate();
