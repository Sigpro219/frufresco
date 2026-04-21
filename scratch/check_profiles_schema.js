
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfilesSchema() {
    console.log('Checking profiles schema...');
    
    // Try to fetch one profile
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    
    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }
    
    if (data && data.length > 0) {
        console.log('Columns in profiles:', Object.keys(data[0]));
    } else {
        console.log('No profiles found or table is empty.');
    }
}

checkProfilesSchema();
