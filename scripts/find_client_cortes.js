const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function findClient() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, address, contact_phone, latitude, longitude')
    .ilike('company_name', '%cortes%');
  console.log('Profiles found:', profiles);
}
findClient();
