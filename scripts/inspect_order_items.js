const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  const k = parts[0];
  const v = parts.slice(1).join('=');
  if (k && v) env[k.trim()] = v.trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspectItems() {
  // Check 2026-11-04 orders
  const { data: oToday } = await supabase
    .from('orders')
    .select('id, delivery_date, status')
    .eq('delivery_date', '2026-11-04');
  
  console.log('Orders for 2026-11-04 count:', oToday ? oToday.length : 0);
  if (oToday && oToday.length > 0) {
    const ids = oToday.map(o => o.id);
    const { data: items } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit_price')
      .in('order_id', ids.slice(0, 10));
    console.log('Sample items for 2026-11-04 count in first 10 orders:', items ? items.length : 0);
  }

  // Check 2026-10-30 orders
  const { data: oPrev } = await supabase
    .from('orders')
    .select('id, delivery_date, status')
    .eq('delivery_date', '2026-10-30');
  console.log('Orders for 2026-10-30 count:', oPrev ? oPrev.length : 0);
}

inspectItems();
