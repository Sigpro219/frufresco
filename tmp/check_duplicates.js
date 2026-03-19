
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'app_settings' });
  if (error) {
    // Alternatively just select everything and check if there are duplicate keys
    const { data: all, error: allErr } = await supabase.from('app_settings').select('*');
    if (allErr) console.error(allErr);
    else {
      console.log('Row count:', all.length);
      const keys = all.map(r => r.key);
      const uniqueKeys = new Set(keys);
      console.log('Unique key count:', uniqueKeys.size);
      if (keys.length !== uniqueKeys.size) {
        console.log('ERROR: Duplicates found');
        const counts = {};
        keys.forEach(k => counts[k] = (counts[k] || 0) + 1);
        console.log('Duplicate counts:', Object.entries(counts).filter(([k,v]) => v > 1));
      }
    }
  } else {
      console.log(data);
  }
}

checkSchema();
