const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function findParent() {
  const { data: p, error } = await supabase
    .from('products')
    .select('id, name, sku')
    .eq('id', 'f59ed119-7f77-4656-94d8-1ee22a54b9d7')
    .single();
  
  if (error) {
    console.error(error);
  } else {
    console.log('Parent Product found:', p);
  }
}

findParent();
