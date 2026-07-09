const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('order_drafts')
    .select('id, created_at, status, email_subject, client_detected_name, profile_id, extracted_items')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  data.forEach((d, i) => {
    const meta = d.extracted_items?.find(itm => itm.isMetadata) || {};
    const itemsCount = d.extracted_items?.filter(itm => !itm.isMetadata).length || 0;
    console.log(`[${i+1}] ID: ${d.id} | Created: ${d.created_at} | Status: ${d.status} | Subject: "${d.email_subject}" | Client: "${d.client_detected_name}" | ProfileID: ${d.profile_id} | Items Count: ${itemsCount} | Metadata deliveryDate: ${meta.deliveryDate} | deliverySlot: ${meta.deliverySlot}`);
  });
}

run();
