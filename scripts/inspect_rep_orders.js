require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: orders } = await supabase
        .from('orders')
        .select('id, sequence_id, total, total_weight_kg, origin_source, admin_notes, status, created_at')
        .neq('status', 'cancelled')
        .limit(5000);

    const repOrders = (orders || []).filter(o =>
        o.origin_source === 'customer_service' ||
        (o.admin_notes && (o.admin_notes.toUpperCase().includes('REPOSICIÓN') || o.admin_notes.toUpperCase().includes('REPOSICION') || o.admin_notes.toUpperCase().includes('GARANTÍA')))
    );
    console.log('Replacement orders found:', repOrders.length);
    let totalRepKg = 0;
    repOrders.forEach(o => {
        totalRepKg += Number(o.total_weight_kg) || 0;
        console.log(`- Order #${o.sequence_id} | Kg: ${o.total_weight_kg} | Origin: ${o.origin_source} | Status: ${o.status}`);
    });
    console.log('Total Replacement Kg from orders:', totalRepKg);
})();
