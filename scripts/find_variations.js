const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function findVariations() {
  const { data: p, error } = await supabase
    .from('products')
    .select('name, options_config, variants, parent_id');
  
  if (error) {
    console.error(error);
    return;
  }
  
  const hasVariants = p.filter(x => (x.variants && x.variants.length > 0) || x.parent_id);
  console.log('Total products with variants/parent_id:', hasVariants.length);
  hasVariants.slice(0, 10).forEach(x => {
      console.log(`Product: ${x.name} | Has Variants: ${!!x.variants?.length} | ParentID: ${x.parent_id}`);
  });
}

findVariations();
