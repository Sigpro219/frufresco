const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log('Columns in profiles table:', Object.keys(data[0]));
      console.log('Sample data:', data[0]);
    } else {
      console.log('No profiles found or profiles table is empty.');
    }
  } catch (err) {
    console.error('Execution error:', err);
  }
}

checkSchema();
