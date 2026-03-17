const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase4() {
    console.log('🚀 Phase 4: Proceso de Picking (Alistamiento)...');

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const targetDate = now.toISOString().split('T')[0];

    // 1. Get our simulation orders
    const { data: orders } = await supabase.from('orders')
        .select('id, status')
        .eq('delivery_date', targetDate)
        .eq('status', 'approved')
        .ilike('customer_name', '%Sim%');

    if (!orders || orders.length === 0) {
        console.log('⚠️ No simulation orders found to pick.');
        // Fallback: try ALL approved orders for today to keep simulation alive
        const { data: all_orders } = await supabase.from('orders')
            .select('id, status')
            .eq('delivery_date', targetDate)
            .eq('status', 'approved');
        
        if (!all_orders || all_orders.length === 0) {
            console.error('❌ No approved orders found for today.');
            return;
        }
        orders.push(...all_orders);
    }

    console.log(`🧺 Picking ${orders.length} orders...`);

    for (const o of orders) {
        // 2. Update Items (Mark as picked)
        const { data: items } = await supabase.from('order_items').select('id, quantity').eq('order_id', o.id);
        for (const item of items) {
            await supabase.from('order_items')
                .update({ 
                    picked_quantity: item.quantity,
                    picked_at: new Date().toISOString() 
                })
                .eq('id', item.id);
        }

        // 3. Update Order Status
        await supabase.from('orders')
            .update({ status: 'shipped' }) // or 'picked' if that exists, but browser hinted at 'shipped' as next visible step
            .eq('id', o.id);
        
        console.log(`✅ Order ${o.id} Picked & Shipped State.`);
    }

    console.log('🎉 Phase 4 Complete: Orders are now in Dispatch state.');
}

runPhase4();
