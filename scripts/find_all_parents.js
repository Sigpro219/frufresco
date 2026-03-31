const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function findAllParents() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, parent_id')
    .not('parent_id', 'is', null);

  if (error) {
    console.error(error);
  } else {
    console.log(`Found ${data.length} variations (children):`);
    data.forEach(p => {
        console.log(`Child: ${p.name} (${p.sku}) | ParentID: ${p.parent_id}`);
    });
    
    const parentIds = [...new Set(data.map(p => p.parent_id))];
    const { data: parents, error: pError } = await supabase
        .from('products')
        .select('id, name, sku')
        .in('id', parentIds);
    
    if (pError) {
        console.error(pError);
    } else {
        console.log('\nParent mappings:');
        parents.forEach(p => {
            const children = data.filter(c => c.parent_id === p.id);
            console.log(`- Parent: ${p.name} (${p.sku}) -> Children: ${children.map(c => c.name).join(', ')}`);
        });
    }
  }
}

findAllParents();
