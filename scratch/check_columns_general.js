const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check(tableName) {
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Error:', error);
    } else {
        if (data && data.length > 0) {
            console.log(`Columns for ${tableName}:`, Object.keys(data[0]));
        } else {
            console.log(`No data found in ${tableName}`);
        }
    }
}

const table = process.argv[2] || 'providers';
check(table);
