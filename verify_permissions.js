const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load Env manually
try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { console.error('Error reading .env.local', e); }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyPermissions() {
  console.log('--- VERIFYING PERMISSIONS ---');

  const tables = ['routes', 'route_stops', 'fleet_vehicles', 'delivery_events'];
  let allGood = true;

  for (const table of tables) {
    // Try to select 1 record
    const { data, error } = await supabase.from(table).select('*').limit(1);
    
    if (error) {
      console.error(`[${table}] FAIL: ${error.message} (Code: ${error.code})`);
      allGood = false;
    } else {
      console.log(`[${table}] SUCCESS: Read access confirmed. (Rows: ${data.length})`);
    }
  }

  // Verify Relation Query from RoutePlanner
  console.log('--- VERIFYING JOIN QUERY ---');
  const { data: fleetData, error: fleetError } = await supabase
      .from('fleet_vehicles')
      .select('*, driver:profiles(contact_name)')
      .limit(1);

  if (fleetError) {
      console.error(`[fleet_vehicles+driver] FAIL: ${fleetError.message}`);
      allGood = false;
  } else {
      console.log(`[fleet_vehicles+driver] SUCCESS: Relation query worked. (Rows: ${fleetData.length})`);
      if (fleetData.length > 0) {
          console.log('Sample Data:', JSON.stringify(fleetData[0], null, 2));
      }
  }

  if (allGood) {
    console.log('--- PERMISSIONS LOOK GOOD ---');
  } else {
    console.log('--- PERMISSIONS ISSUES DETECTED ---');
  }
}

verifyPermissions();
