
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
let env = {};
try {
    const data = fs.readFileSync(envPath, 'utf8');
    data.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2 && !line.trim().startsWith('#')) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            env[key] = val;
        }
    });
} catch (e) {
    console.error('Could not load .env.local:', e.message);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
    const today = new Date().toISOString().split('T')[0];

    // 1. Check orders with delivery_date = today
    const { count: countToday, error: errToday } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('delivery_date', today)
        .in('status', ['approved', 'processing']);

    // 2. Check ALL active orders regardless of date
    const { count: countActive, error: errActive } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['approved', 'processing']);

    // 3. Check orders created today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const { count: countCreatedToday } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

    if (errToday || errActive) {
        console.error('Error fetching orders:', errToday || errActive);
    } else {
        console.log(`\n--- REPORTE DE PEDIDOS (${today}) ---`);
        console.log(`📦 Para entregar HOY: ${countToday}`);
        console.log(`🔥 Total Activos (Approved/Processing): ${countActive}`);
        console.log(`🆕 Creados HOY: ${countCreatedToday}`);
    }
}

checkOrders();
