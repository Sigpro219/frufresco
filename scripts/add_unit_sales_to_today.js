const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function addItemsToToday() {
  const orderId = 'beefe92a-39ea-405b-bed5-66d60de7fe7a'; // Order #1349 (2026-11-04)
  
  // Set Order #1349 to para_compra so committed sales reflect in inventory
  await supabase.from('orders').update({ status: 'para_compra' }).eq('id', orderId);

  // Check existing items
  const { data: existing } = await supabase.from('order_items').select('product_id').eq('order_id', orderId);
  const existingProductIds = new Set((existing || []).map(e => e.product_id));

  const items = [
    {
      order_id: orderId,
      product_id: 'a744edee-13e0-4fbe-a033-c4eea8224e1c', // Banano uraba
      quantity: 11.2,
      unit: 'Kg',
      unit_price: 3500,
      variant_label: '70 Unidades 160 gr',
      selected_options: {
        'Presentación': 'Unidad 160 gr',
        _original_qty: 70,
        _original_unit: 'Unidad',
        _conversion_factor: 0.16,
        _physical_instruction: '70 und de 160 gr'
      }
    },
    {
      order_id: orderId,
      product_id: '726ff8f1-13e3-4427-8979-9d9ded523ed2', // Mandarina arrayana
      quantity: 8.4,
      unit: 'Kg',
      unit_price: 4200,
      variant_label: '60 Unidades 140 gr',
      selected_options: {
        'Presentación': 'Unidad 140 gr',
        _original_qty: 60,
        _original_unit: 'Unidad',
        _conversion_factor: 0.14,
        _physical_instruction: '60 und de 140 gr'
      }
    },
    {
      order_id: orderId,
      product_id: 'b9ee84ba-fdaa-4e53-9a09-0ed6ac48ce33', // Cubeta huevos tipo aa x 30 unds.
      quantity: 3,
      unit: 'Unidad',
      unit_price: 18500,
      variant_label: 'Cubeta x 30 unds',
      selected_options: {
        'Presentación': 'Cubeta x 30',
        _original_qty: 3,
        _original_unit: 'Unidad',
        _conversion_factor: 1,
        _physical_instruction: '3 Cubetas x 30'
      }
    }
  ];

  const toInsert = items.filter(it => !existingProductIds.has(it.product_id));
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('order_items').insert(toInsert).select('id, product_id, quantity, unit, variant_label');
    console.log('Inserted items into Order #1349:', data, 'Error:', error);
  } else {
    console.log('Items already existed in Order #1349');
  }
}

addItemsToToday();
