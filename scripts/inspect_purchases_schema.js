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

async function inspectPurchasesSchema() {
  const { data: pSample } = await supabase.from('purchases').select('*').limit(1);
  console.log('Purchases columns:', Object.keys(pSample[0] || {}));
  
  const { data: tSample } = await supabase.from('procurement_tasks').select('*').limit(1);
  console.log('Procurement tasks columns:', Object.keys(tSample[0] || {}));
}

inspectPurchasesSchema();
