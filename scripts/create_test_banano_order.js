const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function createTestBananoOrder() {
  // 1. Get next sequence_id
  const { data: topOrders } = await supabase
    .from('orders')
    .select('sequence_id')
    .order('sequence_id', { ascending: false })
    .limit(1);

  let nextSeq = (topOrders?.[0]?.sequence_id || 1378) + 1;

  // Let's create the order for 2026-11-05 (Tomorrow, currently active in testing)
  const datesToCreate = ['2026-11-05'];

  for (const delDate of datesToCreate) {
    const seq = nextSeq++;
    console.log(`Creating order #${seq} for date ${delDate}...`);

    const orderPayload = {
      profile_id: '42bddbfa-377a-45ab-ac8c-800e00f94d87', // INVESTMENTS CORTES
      total: 5600,
      subtotal: 5600,
      tax: 0,
      status: 'para_compra', // Ready in operations and committed to inventory
      type: 'b2b',
      delivery_date: delDate,
      delivery_slot: '06:00 - 10:00',
      shipping_address: 'Autopista Bogotá - Medellín, kilómetro 4.7 costado norte, antes del puente de Siberia, Cota',
      latitude: 4.7586621,
      longitude: -74.1561252,
      admin_notes: '[PRUEBA SDD] 10 Bananos de 160 gramos',
      payment_method: 'credit_30',
      payment_status: 'pending',
      origin: 'web_b2b',
      total_weight_kg: 1.6,
      crates_count: 1,
      sequence_id: seq
    };

    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id, sequence_id, delivery_date, status')
      .single();

    if (orderErr) {
      console.error('Error creating order:', orderErr);
      return;
    }

    console.log('Order created:', orderData);

    const itemPayload = {
      order_id: orderData.id,
      product_id: 'a744edee-13e0-4fbe-a033-c4eea8224e1c', // Banano uraba (weight_kg: 0.16)
      quantity: 1.6, // 10 units * 0.160 kg = 1.60 Kg
      unit: 'Kg',
      unit_price: 3500,
      nickname: 'Banano uraba',
      variant_label: '10 Unidades 160 gr',
      selected_options: {
        'Presentación': 'Unidad 160 gr',
        _original_qty: 10,
        _original_unit: 'Unidad',
        _conversion_factor: 0.16,
        _physical_instruction: '10 und de 160 gr'
      }
    };

    const { data: itemData, error: itemErr } = await supabase
      .from('order_items')
      .insert(itemPayload)
      .select('id, order_id, product_id, quantity, unit, variant_label, selected_options')
      .single();

    if (itemErr) {
      console.error('Error inserting item:', itemErr);
      return;
    }

    console.log('Order item created successfully:', itemData);
  }
}

createTestBananoOrder();
