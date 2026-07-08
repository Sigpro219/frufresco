const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data, error } = await supabase
      .from('order_drafts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Supabase Error:", error);
      return;
    }
    console.log("Drafts found in DB:", data.length);
    data.slice(0, 5).forEach(d => {
      console.log(`ID: ${d.id}, Email: ${d.source_email}, Status: ${d.status}, Date: ${d.created_at}`);
      console.log(`Extracted items count:`, d.extracted_items ? d.extracted_items.length : 0);
      console.log(`Extracted items:`, JSON.stringify(d.extracted_items, null, 2));
    });
  } catch (e) {
    console.error("Exception:", e);
  }
}

check();
