const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function searchById() {
  const idsToSearch = ['1263', '210', '1074', '12'];
  
  for (const tid of idsToSearch) {
    console.log(`\nSearching for Numerical ID: ${tid}`);
    // Search in accounting_id, sku (if it looks like that), or others
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, accounting_id, master_product_id')
      .or(`accounting_id.eq.${tid},sku.eq.${tid}`);
    
    if (error) {
       console.error(error);
    } else {
       console.log(`Found ${data.length} matches:`, data);
    }
  }
}

searchById();
