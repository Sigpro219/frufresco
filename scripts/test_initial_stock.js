const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  const k = parts[0];
  const v = parts.slice(1).join('=');
  if (k && v) env[k.trim()] = v.trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testInitialAndSales() {
  const balanceDate = '2026-11-05';

  // 1. Check products with inventory_stocks
  const { data: prods } = await supabase
    .from('products')
    .select('id, name, inventory_stocks(quantity)')
    .eq('is_active', true)
    .limit(10);

  console.log('Sample products initial stock for 2026-11-05:');
  (prods || []).forEach(p => {
    const stock = p.inventory_stocks?.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0) || 0;
    console.log(`- ${p.name}: ${stock} Kg`);
  });
}

testInitialAndSales();
