const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Load Env
try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function seedZones() {
    console.log('--- SEEDING DISTRIBUTED ZONES ---');

    // 1. Get Zones
    const { data: zones } = await supabase.from('delivery_zones').select('id, name');
    const requiredZones = ['Norte', 'Sur', 'Oriente', 'Occidente', 'Centro'];

    // Create missing zones if any
    for (const name of requiredZones) {
        if (!zones.find(z => z.name === name)) {
            console.log(`Creating missing zone: ${name}`);
            await supabase.from('delivery_zones').insert({ name });
        }
    }
    // Re-fetch zones to be sure
    const { data: allZones } = await supabase.from('delivery_zones').select('id, name');
    console.log(`Available Zones: ${allZones.map(z => z.name).join(', ')}`);

    // 2. Get Clients (Top 50 to have enough density)
    const { data: clients } = await supabase.from('profiles').select('id, company_name').eq('role', 'b2b_client').limit(50);

    if (!clients || clients.length < 5) {
        console.error('Not enough clients to distribute. Please run basic seed first.');
        return;
    }

    // 3. Distribute Clients to Zones
    console.log(`Distributing ${clients.length} clients across ${allZones.length} zones...`);

    for (let i = 0; i < clients.length; i++) {
        const zone = allZones[i % allZones.length]; // Round-robin distribution
        await supabase.from('profiles').update({ delivery_zone_id: zone.id }).eq('id', clients[i].id);
    }

    // 4. Create Orders for these clients (so they show up in dashboard)
    const { data: products } = await supabase.from('products').select('id, base_price, category').limit(8);

    console.log('Generating orders...');
    for (const client of clients) {
        // Upsert Order
        const { data: order, error } = await supabase.from('orders').upsert({
            customer_name: client.company_name,
            status: 'approved',
            total: 100000,
            subtotal: 100000,
            type: 'b2b_credit',
            shipping_address: 'Zone Address',
            delivery_date: new Date().toISOString()
        }, { onConflict: 'customer_name' }).select().single();

        if (error) continue;

        // Clear items
        await supabase.from('order_items').delete().eq('order_id', order.id);

        // Add 3-5 random items
        const itemCount = Math.floor(Math.random() * 3) + 3;
        for (let k = 0; k < itemCount; k++) {
            const prod = products[Math.floor(Math.random() * products.length)];
            await supabase.from('order_items').insert({
                order_id: order.id,
                product_id: prod.id,
                quantity: Math.floor(Math.random() * 20) + 5,
                picked_quantity: 0,
                unit_price: prod.base_price
            });
        }
    }

    console.log('--- DISTRIBUTION COMPLETE ---');
}

seedZones();
