
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActualPolicies() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { table_name: 'app_settings' });
  if (error) {
     const { data: pols, error: pError } = await supabase.from('pg_policies').select('*').eq('tablename', 'app_settings');
     if (pError) console.error(pError);
     else console.log(JSON.stringify(pols, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
checkActualPolicies();
