
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { table_name: 'app_settings' });
  if (error) {
    // try direct query if rpc doesn't exist
    const { data: policies, error: polError } = await supabase.from('pg_policies').select('*').eq('tablename', 'app_settings');
    if (polError) console.error(polError);
    else console.log(policies);
  } else {
    console.log(data);
  }
}

// Alternatively just check if we can actually upsert
async function testUpsert() {
  const testKey = 'test_persistence_' + Date.now();
  const { error } = await supabase.from('app_settings').upsert({ key: testKey, value: 'test' });
  if (error) {
    console.error('UPSERT FAILED:', error.message);
  } else {
    console.log('UPSERT SUCCESS');
    // clean up
    await supabase.from('app_settings').delete().eq('key', testKey);
  }
}

testUpsert();
