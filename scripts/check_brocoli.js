const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function checkBrocoli() {
  const { data: p, error } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%brócoli%');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Found Brocoli variants:', p.length);
  p.forEach(prod => {
    console.log(`Product: ${prod.name} | SKU: ${prod.sku} | ParentID: ${prod.parent_id}`);
    if (prod.variants) {
      console.log('Variants column type:', typeof prod.variants);
      console.log('Variants content:', JSON.stringify(prod.variants, null, 2));
    }
  });
}

checkBrocoli();
