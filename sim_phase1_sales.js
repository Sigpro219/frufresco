const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase1And2() {
    console.log('🚀 Phase 1 & 2: Sales and Authorization (Fixed Status)...');

    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, company_name, role');
    if (pErr) {
        console.error('❌ Profile Fetch Error:', pErr);
        return;
    }

    const b2b_list = profiles.filter(p => p.role === 'b2b_client').slice(0, 2);
    const b2c_list = profiles.filter(p => p.role === 'b2c_client').slice(0, 2);

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const targetDate = now.toISOString().split('T')[0];
    const { data: products } = await supabase.from('products').select('id, name, base_price').limit(2);

    const allCandidates = [...b2b_list, ...b2c_list];
    const createdOrders = [];

    for (const p of allCandidates) {
        process.stdout.write(`📝 Order for ${p.company_name || 'Sim'}... `);
        const type = p.role === 'b2b_client' ? 'b2b' : 'b2c_wompi';
        
        const { data: order, error } = await supabase.from('orders').insert({
            profile_id: p.id,
            customer_name: p.company_name || 'Sim Client',
            delivery_date: targetDate,
            delivery_slot: 'mañana',
            status: 'approved', // FIXED: verified in Step 623
            type: type,
            origin_source: 'web',
            subtotal: 75000,
            total: 75000,
            shipping_address: 'Calle Simulation E2E 123',
            is_b2b: p.role === 'b2b_client'
        }).select().single();

        if (error) {
            console.log(`❌ ERROR: ${error.message}`);
            continue;
        }

        if (order) {
            createdOrders.push(order.id);
            // Add items
            await supabase.from('order_items').insert(products.map(pr => ({
                order_id: order.id,
                product_id: pr.id,
                quantity: 10,
                unit_price: pr.base_price || 2000
            })));

            // Sync with Procurement
            for (const pr of products) {
                const { error: ptErr } = await supabase.from('procurement_tasks').upsert({
                    product_id: pr.id,
                    delivery_date: targetDate,
                    total_requested: 10, // simplified for E2E
                    status: 'pending'
                }, { onConflict: 'product_id, delivery_date' });
                if (ptErr) console.warn('PT err:', ptErr.message);
            }
            console.log(`✅ OK (${order.id})`);
        }
    }

    console.log(`\n🎉 Phase 1 & 2 Complete: ${createdOrders.length} orders ready for procurement.`);
}

runPhase1And2();
