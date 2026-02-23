const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function seedHeavyFinal() {
    console.log('--- SEEDING HEAVY FINAL (100% DENSITY) ---');

    // 1. Clients
    const { data: clients } = await supabase.from('profiles').select('id, company_name').eq('role', 'b2b_client').limit(50);
    console.log(`Clients: ${clients.length}`);

    // 2. Products
    const { data: products } = await supabase.from('products').select('id, name, base_price, category');

    // Group
    const byCat = {};
    products.forEach(p => {
        if (!byCat[p.category]) byCat[p.category] = [];
        byCat[p.category].push(p);
    });
    console.log('Categories:', Object.keys(byCat));

    // 3. Insert
    for (const client of clients) {
        if (!client.company_name) {
            console.error('Skipping client with no name:', client.id);
            continue;
        }

        // Upsert Order
        const { data: order, error: orderError } = await supabase.from('orders').upsert({
            customer_name: client.company_name,
            status: 'approved',
            total: 999999,
            subtotal: 999999,
            type: 'b2b_credit',
            shipping_address: 'Full Diversity St',
            delivery_date: new Date().toISOString()
        }, { onConflict: 'customer_name' }).select().single();

        if (orderError || !order) {
            continue;
        }

        // Clear Items
        await supabase.from('order_items').delete().eq('order_id', order.id);

        const itemsToInsert = [];

        // Force pick ALL from EACH category - 100% DENSITY
        for (const cat of Object.keys(byCat)) {
            const catProds = byCat[cat];

            // Pick ALL products!
            const count = catProds.length;
            const picked = catProds;

            picked.forEach(p => {
                itemsToInsert.push({
                    order_id: order.id,
                    product_id: p.id,
                    quantity: Math.floor(Math.random() * 20) + 5,
                    picked_quantity: Math.random() > 0.6 ? 5 : 0,
                    unit_price: p.base_price
                });
            });
        }

        // Insert Batch
        const chunkSize = 100;
        for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
            const chunk = itemsToInsert.slice(i, i + chunkSize);
            const { error } = await supabase.from('order_items').insert(chunk);
            if (error) console.error(`Error inserting chunk for ${client.company_name}:`, error.message);
        }
    }
    console.log('--- FINAL SEED COMPLETE ---');
}

seedHeavyFinal();
