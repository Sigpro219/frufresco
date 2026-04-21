
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFleetSchema() {
    console.log('Checking fleet_vehicles schema...');
    
    // Try to fetch one vehicle to see columns
    const { data, error } = await supabase.from('fleet_vehicles').select('*').limit(1);
    
    if (error) {
        console.error('Error fetching fleet_vehicles:', error);
        return;
    }
    
    if (data && data.length > 0) {
        const columns = Object.keys(data[0]);
        console.log('Columns in fleet_vehicles:', columns);
        if (!columns.includes('driver_id')) {
            console.error('CRITICAL: driver_id column is MISSING in fleet_vehicles.');
        } else {
            console.log('driver_id column exists.');
        }
    } else {
        console.log('No vehicles found in fleet_vehicles table.');
    }
}

checkFleetSchema();
