const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function testDailyFamilies() {
  const { data: prods } = await supabase
    .from('products')
    .select('id, sku, accounting_id, name, parent_id, is_active')
    .ilike('name', '%acelga%');

  // Logic from InventoryDailyBalanceTab:
  const parentIdsWithChildren = new Set();
  prods.forEach(p => {
    if (p.parent_id && p.parent_id !== p.id) {
      parentIdsWithChildren.add(p.parent_id);
    }
  });

  console.log('parentIdsWithChildren:', Array.from(parentIdsWithChildren));

  const childrenByParent = new Map();
  const childProductIds = new Set();

  prods.forEach(row => {
    if (row.parent_id && row.parent_id !== row.id) {
      childProductIds.add(row.id);
      const list = childrenByParent.get(row.parent_id) || [];
      list.push(row);
      childrenByParent.set(row.parent_id, list);
    }
  });

  console.log('childProductIds:', Array.from(childProductIds));
  console.log('childrenByParent keys:', Array.from(childrenByParent.keys()));

  const families = [];
  const processedIds = new Set();
  const dailyRowProductIds = new Set(prods.map(r => r.id));

  prods.forEach(row => {
    if (childProductIds.has(row.id)) {
      const parentExists = row.parent_id ? dailyRowProductIds.has(row.parent_id) : false;
      if (parentExists) return;
    }

    if (processedIds.has(row.id)) return;
    processedIds.add(row.id);

    const hasChildren = childrenByParent.has(row.id);
    const children = childrenByParent.get(row.id) || [];

    families.push({
      id: row.id,
      name: row.name,
      isParent: hasChildren,
      childrenCount: children.length,
      childrenNames: children.map(c => c.name)
    });
  });

  console.log('\n--- Resulting Families for Acelga ---');
  console.log(JSON.stringify(families, null, 2));
}

testDailyFamilies().catch(console.error);
