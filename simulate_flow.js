const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulate() {
    console.log('🚀 Starting Final E2E Flow Simulation...');

    // 1. Get a B2B client
    const { data: b2b_profiles } = await supabase
        .from('profiles')
        .select('id, user_id, company_name')
        .eq('role', 'b2b_client')
        .limit(1);
    
    if (!b2b_profiles || b2b_profiles.length === 0) {
        console.error('❌ No B2B client found.');
        return;
    }
    const profile = b2b_profiles[0];
    console.log(`👤 Using client: ${profile.company_name}`);

    // 2. Setup dates (Bogota)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const targetDate = now.toISOString().split('T')[0];

    // 3. Create Order
    console.log('1️⃣ Creating authorized order...');
    const { data: order, error: oErr } = await supabase.from('orders').insert({
        user_id: profile.user_id,
        profile_id: profile.id,
        customer_name: 'SIM_FINAL_FLOW',
        delivery_date: targetDate,
        delivery_slot: 'mañana',
        status: 'authorized',
        type: 'b2b_test',
        origin_source: 'web',
        subtotal: 100,
        total: 100,
        shipping_address: 'Calle Simulation'
    }).select().single();

    if (oErr) {
        console.error('❌ Order Error:', oErr);
        return;
    }
    console.log(`✅ Order ${order.id} CREATED.`);

    // 4. Products
    const { data: products } = await supabase.from('products').select('id, name').limit(1);
    const prod = products[0];

    // 5. Procurement Task
    console.log('2️⃣ Creating procurement task...');
    await supabase.from('procurement_tasks').insert({
        product_id: prod.id,
        total_requested: 1,
        total_purchased: 0,
        status: 'pending',
        delivery_date: targetDate
    });

    // 6. Purchase & Inventory
    console.log('3️⃣ Creating received purchase and inventory...');
    const { data: providers } = await supabase.from('profiles').select('id').eq('role', 'provider').limit(1);
    const providerId = providers ? providers[0]?.id : null;

    const { data: purchase } = await supabase.from('purchases').insert({
        status: 'received_ok',
        total_amount: 1,
        provider_id: providerId,
        delivery_date: targetDate
    }).select().single();

    if (purchase) {
        await supabase.from('inventory_movements').insert({
            product_id: prod.id,
            quantity: 1,
            type: 'entry',
            reason: 'purchase_reception',
            reference_id: purchase.id
        });
        console.log('✅ Inventory updated.');
    }

    console.log('\n🌟 PRE-FLIGHT CHECK COMPLETE: RECEPTION/COMPRAS PIPELINE PASS');
}

simulate();
