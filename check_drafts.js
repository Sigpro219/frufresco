const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('order_drafts')
    .select('id, client_detected_name, source_email, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching drafts:', error);
    return;
  }

  console.log('Latest 5 drafts:');
  console.log(JSON.stringify(data, null, 2));
}

main();
