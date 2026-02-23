const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo'
);

async function check() {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Error:', error.message);
  } else if (data && data.length > 0) {
    console.log('Columns in product_variants:', Object.keys(data[0]));
  } else {
    console.log('Table exists but is empty. Trying to get columns via another way...');
    // If empty, we can try to insert a dummy and rollback, or just guess.
    // Actually, maybe I can use RPC to check schema.
  }
}
check();
