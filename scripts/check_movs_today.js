const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: movs } = await supabase
    .from('inventory_movements')
    .select('product_id, quantity, type, reference_type, notes, created_at, products(name, sku, unit_of_measure)')
    .gte('created_at', '2026-11-04T00:00:00Z')
    .lte('created_at', '2026-11-04T23:59:59Z');
  console.log('Movements count on 2026-11-04:', movs ? movs.length : 0);
  if (movs) {
    movs.forEach(m => console.log(m.products?.name, m.type, m.reference_type, m.quantity, m.notes));
  }
}
run();
