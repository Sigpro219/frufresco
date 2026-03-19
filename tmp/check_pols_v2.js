
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPols() {
  const { data, error } = await supabase.rpc('get_table_policies', { table_name: 'app_settings' });
  if (error) {
    // try to list what's in the DB directly
    const { data: pols, error: pError } = await supabase.rpc('inspect_policies', { t_name: 'app_settings' });
    if (pError) {
       console.log('Cant inspect policies directly via RPC.');
       // Assume there might be an "admin_access" policy that is too restrictive.
    } else {
       console.log(pols);
    }
  } else {
    console.log(data);
  }
}
checkPols();
