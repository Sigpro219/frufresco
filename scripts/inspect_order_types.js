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

async function inspectOrderTypes() {
  const { data } = await supabase.from('orders').select('type');
  const types = [...new Set((data || []).map(d => d.type))];
  console.log('Distinct order types in DB:', types);

  const { data: slots } = await supabase.from('orders').select('delivery_slot');
  const distinctSlots = [...new Set((slots || []).map(d => d.delivery_slot))];
  console.log('Distinct delivery slots in DB:', distinctSlots);
}

inspectOrderTypes();
