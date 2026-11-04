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

async function inspectOrdersColumns() {
  const { data } = await supabase.from('orders').select('*').limit(1);
  console.log('Orders columns:', Object.keys(data[0] || {}));
}

inspectOrdersColumns();
