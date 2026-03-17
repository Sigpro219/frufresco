const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase5And6() {
    console.log('🚀 Phase 5 & 6: Dispatch and Returns...');

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const targetDate = now.toISOString().split('T')[0];

    // 1. Get Shipped orders
    const { data: orders } = await supabase.from('orders')
        .select('id, profile_id, customer_name')
        .eq('delivery_date', targetDate)
        .eq('status', 'shipped');

    if (!orders || orders.length === 0) {
        console.error('❌ No shipped orders found.');
        return;
    }

    console.log(`🚚 Dispatching ${orders.length} orders...`);

    // 2. Simple Route Creation (Simulated Dispatch)
    const { data: route } = await supabase.from('routes').insert({
        name: 'SIM-E2E-ROUTE',
        delivery_date: targetDate,
        status: 'in_transit',
        driver_id: 'eb79e950-7170-4965-aca4-4422f2560377' // fallback driver if exists
    }).select().single();

    if (route) {
        console.log(`✅ Route ${route.id} created and IN TRANSIT.`);
        for (const o of orders) {
             await supabase.from('route_stops').insert({
                route_id: route.id,
                order_id: o.id,
                status: 'pending'
            });
        }
    }

    // 3. Simulate Return (Phase 6)
    const returnOrder = orders[0];
    console.log(`🔄 Simulating return for: ${returnOrder.customer_name}`);
    
    // Create return record
    const { data: ret } = await supabase.from('returns').insert({
        order_id: returnOrder.id,
        reason: 'Producto en mal estado (Simulación)',
        status: 'pending_review',
        total_amount: 5000
    }).select().single();

    if (ret) {
        console.log(`✅ Return ${ret.id} created for order ${returnOrder.id}.`);
    }

    console.log('🏁 Full Simulation Complete.');
}

runPhase5And6();
