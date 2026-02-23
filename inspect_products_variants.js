const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo'
);

async function check() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .limit(1);

  if (data && data.length > 0) {
    console.log('Columns in products table:', Object.keys(data[0]));
    console.log('Sample variants:', data[0].variants);
    console.log('Sample options_config:', data[0].options_config);
  } else {
    console.log('No products found or error:', error);
  }
}
check();
