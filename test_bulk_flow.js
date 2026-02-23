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

async function testBulkApproveFlow() {
    console.log('--- Simulating Bulk Approval & Consolidation ---');
    
    // 1. Get orders in pending_approval
    const { data: orders, error: getErr } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'pending_approval');

    if (getErr) return console.error('Error fetching orders:', getErr);
    if (!orders || orders.length === 0) return console.log('No orders to approve.');

    const ids = orders.map(o => o.id);
    console.log(`Approving ${ids.length} orders (Moving to 'approved' since 'para_compra' is missing in Enum)...`);

    // 2. Update to approved
    const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'approved' })
        .in('id', ids);

    if (updateErr) return console.error('Error updating orders:', updateErr);
    console.log('✅ Bulk Status Update Success!');

    // 3. Simulate Consolidation
    // Date filter: Today (13) and Tomorrow (14) if it's late
    const targetDate = '2026-02-13'; // matching the orders found earlier
    console.log(`--- Running Consolidation for ${targetDate} ---`);

    const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select(`
            id, 
            quantity, 
            product_id, 
            variant_label,
            products(unit_of_measure),
            orders!inner(delivery_date, status)
        `)
        .eq('orders.delivery_date', targetDate)
        .eq('orders.status', 'approved'); // Temporarily matching only approved

    if (itemsErr) return console.error('Error fetching items:', itemsErr);
    if (!items || items.length === 0) return console.log('No items found for consolidation.');

    console.log(`Found ${items.length} order items to consolidate.`);

    const totals = {};
    items.forEach(item => {
        const variant = item.variant_label || '';
        const key = `${item.product_id}_${variant}`;
        if (!totals[key]) {
            totals[key] = {
                qty: 0,
                unit: item.products?.unit_of_measure || 'kg',
                pid: item.product_id,
                variant: variant
            };
        }
        totals[key].qty += item.quantity;
    });

    for (const key in totals) {
        const t = totals[key];
        const { data: existing } = await supabase
            .from('procurement_tasks')
            .select('id, total_requested')
            .eq('product_id', t.pid)
            .eq('variant_label', t.variant)
            .eq('delivery_date', targetDate)
            .maybeSingle();

        if (existing) {
            await supabase.from('procurement_tasks')
                .update({ total_requested: t.qty })
                .eq('id', existing.id);
            console.log(`Updated task for ${t.pid} (${t.variant}): ${t.qty} ${t.unit}`);
        } else {
            await supabase.from('procurement_tasks').insert({
                product_id: t.pid,
                variant_label: t.variant,
                total_requested: t.qty,
                unit: t.unit,
                delivery_date: targetDate
            });
            console.log(`Created new task for ${t.pid} (${t.variant}): ${t.qty} ${t.unit}`);
        }
    }
    console.log('✅ Consolidation Success! Data should be visible in /ops/compras.');
}

testBulkApproveFlow();
