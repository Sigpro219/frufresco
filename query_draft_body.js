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
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    console.error('Error:', error);
    return;
  }

  data.forEach((draft, idx) => {
    console.log(`\n================ DRAFT ${idx + 1} ================`);
    console.log('ID:', draft.id);
    console.log('Client:', draft.client_detected_name);
    console.log('Subject:', draft.email_subject);
    console.log('Created At:', draft.created_at);
    // Log all fields except extracted_items (which we saw)
    const { extracted_items, ...rest } = draft;
    console.log('Draft Columns:', JSON.stringify(rest, null, 2));
  });
}

main();
