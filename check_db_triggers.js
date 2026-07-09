const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Try to query order_drafts policies and triggers if we can via postgres views
  const { data: triggers, error: tErr } = await supabase
    .from('order_drafts')
    .select('*')
    .limit(1);

  console.log("Supabase Connection test ok. Error:", tErr);
  
  // Let's run a query to get database triggers using the get_triggers RPC if it exists
  const { data: trigData, error: trigErr } = await supabase.rpc('get_triggers', { table_name: 'order_drafts' });
  console.log("Triggers:", trigData, "Error:", trigErr);

  // Let's list some functions in the db if possible
  const { data: funcData, error: funcErr } = await supabase.rpc('list_functions');
  console.log("Functions:", funcData, "Error:", funcErr);
}

run();
