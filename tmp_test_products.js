const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase URL or Anon Key in process.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log(`Connecting to: ${supabaseUrl}`);
  const { data, error } = await supabase.from('products').select('*').eq('is_active', true).eq('show_on_web', true).limit(5);
  
  if (error) {
    console.error('Error fetching products:', error);
  } else {
    console.log(`Found ${data.length} products`);
    data.forEach(p => console.log(`- ${p.name} (active: ${p.is_active}, show: ${p.show_on_web})`));
  }
}

testConnection();
