const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function findComplex() {
  const { data: p, error } = await supabase
    .from('products')
    .select('name, options_config, variants, parent_id');
  
  if (error) {
    console.error(error);
    return;
  }
  
  const complex = p.filter(x => 
    (x.options_config && x.options_config.length > 0) || 
    (x.variants && x.variants.length > 0) ||
    x.parent_id
  );
  
  console.log('Total complex products:', complex.length);
  complex.forEach(x => {
    console.log(`- ${x.name}`);
    if (x.options_config) console.log(`  OptionsConfig: ${JSON.stringify(x.options_config)}`);
    if (x.variants) console.log(`  VariantsCount: ${x.variants.length}`);
    if (x.parent_id) console.log(`  ParentID: ${x.parent_id}`);
  });
}

findComplex();
