const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function checkVariantsColumn() {
  const { data: p, error } = await supabase
    .from('products')
    .select('id, name, sku, variants, options_config')
    .not('variants', 'is', null);

  if (error) {
    console.error(error);
  } else {
    console.log(`Found ${p.length} products with 'variants' column populated:`);
    p.forEach(x => {
        if (x.variants && x.variants.length > 0) {
            console.log(`- Product: ${x.name} (${x.sku}) | Variants Count: ${x.variants.length}`);
        }
    });
  }
}

checkVariantsColumn();
