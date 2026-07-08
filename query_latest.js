const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('order_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error(error);
    return;
  }

  data.forEach((d, i) => {
    console.log(`\n--- Draft ${i+1} ---`);
    console.log("ID:", d.id);
    console.log("Subject:", d.email_subject);
    console.log("Body:", d.email_body);
    console.log("Items:", JSON.stringify(d.extracted_items, null, 2));
  });
}

run();
