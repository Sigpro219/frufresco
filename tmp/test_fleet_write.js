
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFleetWrite() {
  const { data, error } = await supabase.from('fleet_tenants').select('id').limit(1);
  if (error) console.error('READ FAILED:', error.message);
  else {
    console.log('READ SUCCESS');
    const { error: updErr } = await supabase.from('fleet_tenants').update({ updated_at: new Date().toISOString() }).eq('id', data[0].id);
    if (updErr) console.error('WRITE FAILED:', updErr.message);
    else console.log('WRITE SUCCESS');
  }
}
testFleetWrite();
