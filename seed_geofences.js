
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

const B2C_POLYGON = [
    { lat: 4.647, lng: -74.062 }, // Chapinero 60
    { lat: 4.685, lng: -74.030 }, // Usaquen East
    { lat: 4.760, lng: -74.045 }, // 170 North
    { lat: 4.720, lng: -74.095 }, // Suba West
    { lat: 4.665, lng: -74.080 }  // 72ish West
];

const B2B_POLYGON = [
    { lat: 4.450, lng: -74.150 }, // South limit (Soacha)
    { lat: 4.600, lng: -74.250 }, // Mosquera
    { lat: 4.900, lng: -74.100 }, // Chia/Cajica
    { lat: 4.750, lng: -73.950 }, // La Calera
    { lat: 4.540, lng: -74.100 }  // South (near USME)
];

async function seedGeofences() {
    const settings = [
        { key: 'geofence_b2c_poly', value: JSON.stringify(B2C_POLYGON), description: 'B2C Delivery Zone (Chapinero/Usaquén)' },
        { key: 'geofence_b2b_poly', value: JSON.stringify(B2B_POLYGON), description: 'B2B Delivery Zone (Sabana de Bogotá/Soacha)' }
    ];

    for (const s of settings) {
        const { error } = await supabase.from('app_settings').upsert(s);
        if (error) console.error(`Error seeding ${s.key}:`, error.message);
        else console.log(`Seeded ${s.key} ✓`);
    }
}

seedGeofences();
