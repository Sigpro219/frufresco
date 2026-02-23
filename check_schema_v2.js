
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function checkColumns() {
    const tables = ['profiles', 'orders'];
    for (const table of tables) {
        console.log(`\n--- Table: ${table} ---`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.error(`Error in ${table}:`, error.message);
        } else if (data && data.length > 0) {
            const columns = Object.keys(data[0]);
            const hasLat = columns.includes('latitude');
            const hasLng = columns.includes('longitude');
            console.log(`Has Latitude: ${hasLat}`);
            console.log(`Has Longitude: ${hasLng}`);
            console.log(`All Columns: ${columns.join(', ')}`);
        } else {
            console.log(`Table ${table} is empty.`);
        }
    }
}

checkColumns();
