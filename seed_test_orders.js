
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL, SUPABASE_KEY;

try {
    const envPath = path.resolve(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if (keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} catch (e) { }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedOrders() {
    console.log('Starting Order Seed...');

    // 1. Fetch Clients (Profiles)
    const { data: clients } = await supabase.from('profiles').select('id, company_name').eq('role', 'b2b_client');
    if (!clients || clients.length === 0) {
        console.error('No clients found. Run seed_picking_data.js first.');
        return;
    }

    // 2. Fetch Products
    const { data: products } = await supabase.from('products').select('id, base_price');
    if (!products || products.length === 0) {
        console.error('No products found.');
        return;
    }

    console.log(`Found ${clients.length} clients and ${products.length} products.`);

    for (const client of clients) {
        // Create 1 Order per Client
        const { data: order, error: orderError } = await supabase.from('orders').insert({
            customer_name: client.company_name,
            customer_email: 'test@example.com',
            status: 'approved', // Active for picking
            type: 'Institucional',
            total: 0, // Will update later
            subtotal: 0
            // profile_id: client.id (Assuming we might link it later, but not strictly required for this dash if we matching by name or just testing)
            // Note: Dashboard doesn't link order -> profile yet, it links (Client Column) -> (Zone/Profile Data). 
            // The dashboard ideally needs to know which order belongs to which "Client Column". 
            // In the dashboard code, we loaded profiles. We need to link these orders to those profiles.
            // If 'orders' has 'profile_id', let's use it. If not, we might rely on customer_name match or add column. 
            // Checking schema locally is hard without SQL access, but let's try adding 'profile_id' if possible or just use name match in dash.
            // For now, let's assume we match by 'customer_name' in the dashboard logic if profile_id is missing.
        }).select().single();

        if (orderError) {
            console.error(`Error creating order for ${client.company_name}:`, orderError.message);
            continue;
        }

        // Add 5-12 random items
        const numItems = Math.floor(Math.random() * 8) + 5;
        let total = 0;

        const orderItems = [];
        for (let i = 0; i < numItems; i++) {
            const product = products[Math.floor(Math.random() * products.length)];
            const qty = Math.floor(Math.random() * 20) + 1; // 1-20 units/kg

            orderItems.push({
                order_id: order.id,
                product_id: product.id,
                quantity: qty,
                unit_price: product.base_price
            });
            total += qty * product.base_price;
        }

        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
        if (itemsError) console.error(`Error adding items for ${client.company_name}:`, itemsError.message);

        // Update Total
        await supabase.from('orders').update({ total, subtotal: total }).eq('id', order.id);

        console.log(`Created order for ${client.company_name} with ${numItems} items.`);
    }

    console.log('Order Seed Completed.');
}

seedOrders();
