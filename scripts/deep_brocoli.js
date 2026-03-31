const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function checkBro() {
    const { data: p, error } = await supabase
        .from('products')
        .select('*')
        .or('name.ilike.%brócoli%,name.ilike.%brocoli%');
    
    if (error) {
        console.error(error);
    } else {
        console.log('Matches for Broccoli:', p.length);
        p.forEach(x => {
            console.log(`- ${x.name} | SKU: ${x.sku} | ID: ${x.id} | ParentID: ${x.parent_id}`);
        });
    }
}
checkBro();
