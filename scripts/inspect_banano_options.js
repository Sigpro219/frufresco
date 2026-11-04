const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectBanano() {
  const { data: prods } = await supabase
    .from('products')
    .select('id, name, sku, unit_of_measure, weight_kg, options, inventory_group, category, is_active')
    .ilike('name', '%banano%');

  console.log('Banano products:');
  prods?.forEach(p => {
    console.log(`- ID: ${p.id} | Name: ${p.name} | SKU: ${p.sku} | Unit: ${p.unit_of_measure} | Weight: ${p.weight_kg} | Options:`, p.options);
  });
}
inspectBanano();
