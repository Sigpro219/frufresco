const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkNextSeq() {
  const { data } = await supabase
    .from('orders')
    .select('sequence_id')
    .order('sequence_id', { ascending: false })
    .limit(1);
  console.log('Highest sequence_id:', data?.[0]?.sequence_id);
}
checkNextSeq();
