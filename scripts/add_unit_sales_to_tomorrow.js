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

async function addUnitSalesToTomorrow() {
  // Get order #1375 on 2026-11-05
  const { data: o } = await supabase
    .from('orders')
    .select('id, sequence_id')
    .eq('delivery_date', '2026-11-05')
    .limit(1)
    .single();

  if (!o) {
    console.error('No order found on 2026-11-05');
    return;
  }

  console.log('Adding sample unit products to Order #', o.sequence_id, '(', o.id, ')');

  // Products:
  // 1. Banano uraba (a744edee-13e0-4fbe-a033-c4eea8224e1c) - Kg with unit breakdown: 70 und de 160 gr
  // 2. Mandarina arrayana (726ff8f1-13e3-4427-8979-9d9ded523ed2) - Kg with unit breakdown: 60 und de 140 gr
  // 3. Cubeta huevos tipo aa x 30 unds. (b9ee84ba-fdaa-4e53-9a09-0ed6ac48ce33) - Pure unit product (3 und)

  const itemsToAdd = [
    {
      order_id: o.id,
      product_id: 'a744edee-13e0-4fbe-a033-c4eea8224e1c', // Banano uraba
      quantity: 11.2,
      unit_price: 3500,
      unit: 'Kg',
      nickname: 'Banano uraba',
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
      order_id: o.id,
      product_id: '726ff8f1-13e3-4427-8979-9d9ded523ed2', // Mandarina arrayana
      quantity: 8.4,
      unit_price: 4200,
      unit: 'Kg',
      nickname: 'Mandarina arrayana',
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
      order_id: o.id,
      product_id: 'b9ee84ba-fdaa-4e53-9a09-0ed6ac48ce33', // Cubeta huevos tipo aa x 30 unds.
      quantity: 3,
      unit_price: 18500,
      unit: 'Unidad',
      nickname: 'Cubeta huevos tipo aa x 30 unds.',
      variant_label: 'Cubeta x 30 unds',
      selected_options: {
        'Presentación': 'Cubeta x 30 unds',
        _original_qty: 3,
        _original_unit: 'Unidad'
      }
    }
  ];

  const { data: inserted, error: insErr } = await supabase
    .from('order_items')
    .insert(itemsToAdd)
    .select('id, product_id, quantity, unit, variant_label');

  if (insErr) {
    console.error('Error inserting items:', insErr);
  } else {
    console.log('Successfully inserted 3 items into order:', inserted);
  }
}

addUnitSalesToTomorrow();
