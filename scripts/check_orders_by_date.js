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

async function check() {
  const { data: dates, error } = await supabase
    .from('orders')
    .select('delivery_date, status')
    .order('delivery_date', { ascending: false })
    .limit(300);

  if (error) {
    console.error('Error fetching orders:', error);
    return;
  }

  const counts = {};
  dates.forEach(d => {
    const key = `${d.delivery_date} [${d.status}]`;
    counts[key] = (counts[key] || 0) + 1;
  });
  console.log('Orders breakdown:\n', JSON.stringify(counts, null, 2));
}

check();
