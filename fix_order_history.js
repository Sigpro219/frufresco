
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables manually from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.trim();
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixOrders() {
    console.log('🔍 Identifying recent B2B orders without correct origin_source...');

    // Find recent B2B orders (last 20)
    const { data: b2bOrders, error } = await supabase
        .from('orders')
        .select('id, delivery_date, type, origin_source, created_at')
        .eq('type', 'b2b_credit')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${b2bOrders.length} recent B2B orders.`);

    let fixedCount = 0;

    for (const order of b2bOrders) {
        // If origin is missing, null, or 'phone' (likely default), fix it to 'web'
        // Only if created recently (e.g. within last day or so based on ID) or explicitly filtered
        
        console.log(`👉 Checking Order ${order.id} | Origin: ${order.origin_source}`);

        if (!order.origin_source || order.origin_source === 'phone') {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ origin_source: 'web' })
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Failed to update order ${order.id}:`, updateError);
            } else {
                console.log(`✅ Order ${order.id} updated to 'web' origin (🛒).`);
                fixedCount++;
            }
        } else {
            console.log(`ℹ️ Order ${order.id} already correct: ${order.origin_source}`);
        }
    }

    console.log(`\n🎉 Process complete. Fixed ${fixedCount} orders.`);
}

fixOrders();
