const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select('id, product_id, quantity, unit_price, total_cost, purchase_unit, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log('Purchases sample:', purchases);

  const { data: movs, error: mErr } = await supabase
    .from('inventory_movements')
    .select('id, product_id, quantity, type, reference_type, notes, created_at')
    .in('reference_type', ['purchase_reception', 'purchase', 'entry'])
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Inventory movements purchase samples:', movs);
}

inspect();
