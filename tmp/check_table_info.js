
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableInfo() {
  const { data, error } = await supabase.rpc('get_table_info', { t_name: 'app_settings' });
  if (error) {
    console.log('RPC failed, trying raw query for definition...');
    const { data: cols, error: colErr } = await supabase.from('information_schema.columns').select('column_name, data_type, is_nullable').eq('table_name', 'app_settings');
    if (colErr) console.error(colErr);
    else console.log('Columns:', cols);
  } else {
    console.log(data);
  }
}

checkTableInfo();
