const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function checkActualVariants() {
  const { data: p, error } = await supabase
    .from('products')
    .select('name, variants, options_config');

  if (error) {
    console.error(error);
  } else {
    const withVariants = p.filter(x => x.variants && x.variants.length > 0);
    console.log(`Actual products with variants: ${withVariants.length}`);
    withVariants.forEach(x => {
        console.log(`- ${x.name}: ${JSON.stringify(x.variants)}`);
    });
  }
}

checkActualVariants();
