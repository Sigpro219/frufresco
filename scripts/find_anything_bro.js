const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function findAnythingWithBroo() {
  const { data: p, error } = await supabase
    .from('products')
    .select('id, name, sku, parent_id')
    .ilike('name', '%bro%');
  
  if (error) {
    console.error(error);
  } else {
    console.log('Results matching %bro%:', p);
  }
}

findAnythingWithBroo();
