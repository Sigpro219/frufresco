
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTriggers() {
  const { data, error } = await supabase.from('pg_trigger').select('tgname').eq('tgrelid', "'public.app_settings'::regclass");
  if (error) {
     const { data: trigs, error: tError } = await supabase.rpc('get_table_triggers', { table_name: 'app_settings' });
     if (tError) console.log('No triggers found or cannot read them.');
     else console.log(trigs);
  } else {
    console.log(data);
  }
}
checkTriggers();
