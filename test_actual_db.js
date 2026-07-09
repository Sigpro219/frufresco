const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function test() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

    const supabase = createClient(url, key);

    console.log('Fetching a row from orders...');
    const { data: order, error: orderErr } = await supabase.from('orders').select('*').limit(1);
    if (orderErr) {
        console.error('Error fetching order:', orderErr.message);
    } else if (order && order.length > 0) {
        console.log('Order columns:', Object.keys(order[0]));
    } else {
        console.log('No orders found.');
    }

    console.log('Fetching a row from order_items...');
    const { data: item, error: itemErr } = await supabase.from('order_items').select('*').limit(1);
    if (itemErr) {
        console.error('Error fetching order item:', itemErr.message);
    } else if (item && item.length > 0) {
        console.log('Order Item columns:', Object.keys(item[0]));
    } else {
        console.log('No order items found.');
    }
}
test();
