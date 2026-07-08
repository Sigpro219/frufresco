const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('products')
    .select('name, unit_of_measure')
    .in('name', ['Cubeta huevos tipo a x 30 unds.', 'Leche entera alqueria', 'Arroz', 'Pan hamburguesa bimbo']);
  
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

check();
