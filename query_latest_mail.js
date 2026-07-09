const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('mail')
    .select('id, created_at, status, subject, error_message')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  data.forEach((d, i) => {
    console.log(`[${i+1}] ID: ${d.id} | Created: ${d.created_at} | Status: ${d.status} | Subject: "${d.subject}" | Error: "${d.error_message}"`);
  });
}

run();
