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

async function seedHeavy() {
    console.log('--- SEEDING HEAVY LOAD (DENSE GRID) ---');

    // 1. Get Clients (Top 60)
    const { data: clients } = await supabase.from('profiles').select('id, company_name').eq('role', 'b2b_client').limit(60);

    if (!clients || clients.length === 0) {
        console.error('No clients found!');
        return;
    }

    // 2. Get ALL Products
    const { data: products } = await supabase.from('products').select('id, base_price, category');

    console.log(`Generating heavy orders for ${clients.length} clients using ${products.length} products...`);

    for (const client of clients) {
        // Upsert Order
        const { data: order, error } = await supabase.from('orders').upsert({
            customer_name: client.company_name,
            status: 'approved',
            total: 250000,
            subtotal: 250000,
            type: 'b2b_credit',
            shipping_address: 'Heavy St 999',
            delivery_date: new Date().toISOString()
        }, { onConflict: 'customer_name' }).select().single();

        if (error) continue;

        // Clear items first to avoid duplicates/confusion if re-running
        await supabase.from('order_items').delete().eq('order_id', order.id);

        // Add 15-25 items per client to make the grid very dense
        const itemCount = Math.floor(Math.random() * 10) + 15; // 15 to 25 items

        // Group products by category
        const productsByCategory = products.reduce((acc, p) => {
            if (!acc[p.category]) acc[p.category] = [];
            acc[p.category].push(p);
            return acc;
        }, {});

        // Select 2-3 items from EACH category to ensure full coverage
        const selected = [];
        Object.keys(productsByCategory).forEach(cat => {
            const catProds = productsByCategory[cat];
            const count = Math.min(catProds.length, Math.floor(Math.random() * 2) + 2); // 2 or 3 items
            const shuffled = catProds.sort(() => 0.5 - Math.random());
            selected.push(...shuffled.slice(0, count));
        });

        // DEBUG: Log categories for first client
        if (client.company_name === clients[0].company_name) {
            console.log('Found Categories:', Object.keys(productsByCategory));
            console.log('Selected Items Categories:', selected.map(p => p.category));
        }

        for (const prod of selected) {
            const { error: insertError } = await supabase.from('order_items').insert({
                order_id: order.id,
                product_id: prod.id,
                quantity: Math.floor(Math.random() * 50) + 10,
                picked_quantity: Math.random() > 0.7 ? Math.floor(Math.random() * 10) : 0,
                unit_price: prod.base_price
            });
            if (insertError) console.error('Insert Error:', insertError.message);
        }
    }

    console.log('--- HEAVY LOAD COMPLETE ---');
}

seedHeavy();
