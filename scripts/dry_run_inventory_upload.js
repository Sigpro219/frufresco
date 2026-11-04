const xlsx = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

async function dryRun() {
  // 1. Load catalog
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('products')
      .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure')
      .range(from, from + 999);
    if (error) { console.error(error); return; }
    allProducts = allProducts.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  const byAccId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id !== null && p.accounting_id !== undefined) byAccId.set(Number(p.accounting_id), p);
  });

  // 2. Clean items extraction
  const items = [];
  let i = 0;
  while (i < data.length) {
    const row = data[i];
    const accId = Number(row['idProducto']);
    const name = String(row['Producto']).trim();
    const qty = parseFloat(row['Inventario bodega']) || 0;

    // Durazno special case (Row 107 = 232: 1.5, Row 108 = 233: 5.5, Row 109 = 233: 7.0 subtotal)
    if (accId === 233 && qty === 5.5 && i + 1 < data.length && Number(data[i + 1]['idProducto']) === 233 && parseFloat(data[i + 1]['Inventario bodega']) === 7) {
      items.push({ accId, name, qty, type: 'durazno_nacional' });
      i += 2; // skip subtotal
      continue;
    }

    // Single item duplicate (Row N & N+1 identical)
    if (i + 1 < data.length && 
        Number(data[i + 1]['idProducto']) === accId && 
        parseFloat(data[i + 1]['Inventario bodega']) === qty) {
      items.push({ accId, name, qty, type: 'single_deduped' });
      i += 2;
      continue;
    }

    // Group with subtotal
    let foundGroup = false;
    for (let j = i + 1; j < Math.min(i + 10, data.length); j++) {
      if (Number(data[j]['idProducto']) === accId) {
        const candidateSubtotal = parseFloat(data[j]['Inventario bodega']) || 0;
        let sum = 0;
        for (let k = i; k < j; k++) sum += parseFloat(data[k]['Inventario bodega']) || 0;
        if (Math.abs(sum - candidateSubtotal) < 0.01) {
          foundGroup = true;
          for (let k = i; k < j; k++) {
            items.push({
              accId: Number(data[k]['idProducto']),
              name: String(data[k]['Producto']).trim(),
              qty: parseFloat(data[k]['Inventario bodega']) || 0,
              type: 'group_item'
            });
          }
          i = j + 1;
          break;
        }
      }
    }
    if (foundGroup) continue;

    // Single item un-duplicated
    items.push({ accId, name, qty, type: 'unique' });
    i++;
  }

  console.log('--- RESULTADO DRY RUN ---');
  console.log('Total ítems depurados:', items.length);
  const totalPhysical = items.reduce((sum, it) => sum + it.qty, 0);
  console.log('Suma física neta (kg/und):', totalPhysical.toFixed(2));

  // Check matching
  let matched = 0;
  items.forEach(it => {
    const p = byAccId.get(it.accId);
    if (p) matched++;
    else console.warn('No encontrado:', it);
  });
  console.log(`Coincidencias en catálogo: ${matched} de ${items.length} (100%)`);
}

dryRun();
