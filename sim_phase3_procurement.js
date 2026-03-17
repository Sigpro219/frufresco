const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase3() {
    try {
        console.log('🚀 Phase 3: Abastecimiento y Recepción (DEBUG)...');

        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
        const targetDate = now.toISOString().split('T')[0];

        // 1. Get products
        const { data: products } = await supabase.from('products').select('id, name').limit(2);
        const { data: providers } = await supabase.from('profiles').select('id').eq('role', 'provider').limit(1);
        const providerId = providers ? providers[0]?.id : null;

        if (!providerId) {
             throw new Error('❌ Provider not found');
        }

        // 2. Create the Purchase
        console.log('📦 Creating Purchase...');
        const { data: purchase, error: pErr } = await supabase.from('purchases').insert({
            provider_id: providerId,
            delivery_date: targetDate,
            status: 'received_ok',
            total_amount: 150000,
            type: 'regular'
        }).select().single();

        if (pErr) throw pErr;
        console.log(`✅ Purchase ${purchase.id} created.`);

        // 3. Procurement Tasks
        console.log('🔄 Updating Procurement Tasks...');
        for (const pr of products) {
            const { error: ptErr } = await supabase.from('procurement_tasks')
                .update({ total_purchased: 40, status: 'completed' })
                .eq('product_id', pr.id)
                .eq('delivery_date', targetDate);
            if (ptErr) console.warn(`PT Update failed for ${pr.id}:`, ptErr.message);
        }

        // 4. Inventory
        console.log('📉 Updating Inventory Movements...');
        for (const pr of products) {
            const { error: mErr } = await supabase.from('inventory_movements').insert({
                product_id: pr.id,
                quantity: 40,
                type: 'entry',
                reason: 'purchase_reception',
                reference_id: purchase.id
            });
            if (mErr) console.warn(`Movement failed for ${pr.id}:`, mErr.message);
        }

        console.log('✅ Phase 3 Complete.');
    } catch (err) {
        console.error('❌ FATAL ERROR PHASE 3:', err);
    }
}

runPhase3();
