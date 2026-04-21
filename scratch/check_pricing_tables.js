const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTable() {
  console.log('Checking pricing_rules table...');
  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*')
    .limit(1);

  if (error) {
    if (error.code === 'PGRST116') {
        console.log('Table pricing_rules exists but is empty (or no data found).');
    } else {
        console.error('Error fetching pricing_rules:', error);
    }
  } else {
    console.log('Table pricing_rules exists. Sample data:', data);
  }

  console.log('\nChecking pricing_models table...');
  const { data: models, error: mError } = await supabase
    .from('pricing_models')
    .select('*')
    .limit(1);

  if (mError) {
    console.error('Error fetching pricing_models:', mError);
  } else {
    console.log('Table pricing_models exists. Sample data:', models);
  }
}

checkTable();
