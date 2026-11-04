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

async function checkNonKgProducts() {
  const { data: prods } = await supabase
    .from('products')
    .select('id, name, unit_of_measure, weight_kg, web_conversion_factor')
    .not('unit_of_measure', 'ilike', '%kg%')
    .limit(20);

  console.log('Sample Non-Kg products in catalog:\n', prods);
}

checkNonKgProducts();
