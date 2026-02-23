const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function debugLatest() {
    console.log('🔍 Inspecting LATEST order...');

    // 1. Get the very last order created
    const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (orderError) {
        console.error('❌ Error fetching order:', orderError);
        return;
    }

    if (!orders || orders.length === 0) {
        console.log('⚠️ No orders found.');
        return;
    }

    const order = orders[0];
    console.log(`✅ Latest Order ID: ${order.id}`);
    console.log(`📅 Created At: ${order.created_at}`);
    console.log(`📍 Coords: Lat ${order.latitude}, Lng ${order.longitude}`);
    console.log(`📦 Status: ${order.status}`);

    // 2. Check items for this order
    console.log('🔍 Checking for items...');
    const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);

    if (itemsError) {
        console.error('❌ Error fetching items:', itemsError);
        // This might hint that variant columns don't exist if the SELECT * fails?
        // Usually SELECT * works even if we don't know columns, unless we tried to SELECT specific missing columns.
        // But the insert in the app uses specific columns.
    } else {
        console.log(`📦 Found ${items.length} items.`);
        if (items.length > 0) {
             console.log('Sample Item:', items[0]);
        }
    }

    // 3. Verify order_items schema manually by trying to select specific variant columns
    console.log('🔍 Verifying "variant_label" and "selected_options" columns...');
    const { error: colError } = await supabase
        .from('order_items')
        .select('variant_label, selected_options')
        .limit(1);

    if (colError) {
        console.error('❌ Column Verification Failed:', colError.message);
        console.log('⚠️ Likely Missing Columns in "order_items" table!');
    } else {
        console.log('✅ Variant columns exist in "order_items".');
    }
}

debugLatest();
