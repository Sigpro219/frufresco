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

async function clone4Orders() {
  // 1. Get max sequence_id
  const { data: topOrders } = await supabase
    .from('orders')
    .select('sequence_id')
    .order('sequence_id', { ascending: false })
    .limit(1);
  let nextSeq = (topOrders && topOrders[0]?.sequence_id ? topOrders[0].sequence_id : 1374) + 1;

  // 2. Select 4 good sample orders from 2026-11-04
  const { data: sampleOrders, error: sErr } = await supabase
    .from('orders')
    .select('*')
    .eq('delivery_date', '2026-11-04')
    .limit(4);

  if (sErr || !sampleOrders || sampleOrders.length < 4) {
    console.error('Error fetching sample orders:', sErr);
    return;
  }

  console.log(`Cloning 4 orders to 2026-11-05 starting with sequence_id: ${nextSeq}`);

  for (const origOrder of sampleOrders) {
    // Fetch items of origOrder
    const { data: origItems, error: iErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', origOrder.id);

    if (iErr) {
      console.error('Error fetching items for order', origOrder.id, iErr);
      continue;
    }

    // Insert new cloned order
    const orderToInsert = {
      profile_id: origOrder.profile_id,
      total: origOrder.total,
      subtotal: origOrder.subtotal,
      tax: origOrder.tax,
      status: 'pending_approval',
      type: origOrder.type || 'b2b',
      delivery_date: '2026-11-05',
      delivery_slot: origOrder.delivery_slot,
      shipping_address: origOrder.shipping_address,
      latitude: origOrder.latitude,
      longitude: origOrder.longitude,
      admin_notes: `[CLONADO DE PRUEBA SDD] Original: #${origOrder.sequence_id}`,
      special_notes: origOrder.special_notes,
      payment_method: origOrder.payment_method,
      payment_status: origOrder.payment_status,
      origin: origOrder.origin,
      total_weight_kg: origOrder.total_weight_kg,
      crates_count: origOrder.crates_count,
      warehouse_spaces: origOrder.warehouse_spaces,
      sequence_id: nextSeq++
    };

    const { data: newOrder, error: insOrderErr } = await supabase
      .from('orders')
      .insert(orderToInsert)
      .select('id, sequence_id')
      .single();

    if (insOrderErr) {
      console.error('Error inserting cloned order:', insOrderErr);
      continue;
    }

    // Insert cloned items
    const itemsToInsert = (origItems || []).map(it => ({
      order_id: newOrder.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      unit: it.unit,
      nickname: it.nickname,
      variant_label: it.variant_label,
      selected_options: it.selected_options
    }));

    if (itemsToInsert.length > 0) {
      const { error: insItemsErr } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (insItemsErr) {
        console.error('Error inserting items for new order:', insItemsErr);
      } else {
        console.log(`Cloned Order #${newOrder.sequence_id} (ID: ${newOrder.id}) with ${itemsToInsert.length} items`);
      }
    }
  }

  console.log('Cloning completed successfully!');
}

clone4Orders();
