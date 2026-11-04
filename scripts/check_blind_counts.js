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

async function checkCounts() {
  const { data, count } = await supabase
    .from('inventory_movements')
    .select('id, product_id, reference_type, notes, created_at', { count: 'exact' })
    .in('reference_type', ['blind_count', 'blind_count_shift_close'])
    .limit(10);

  console.log('Total blind_count in inventory_movements:', count, 'sample:', data);
}

checkCounts();
