const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('daily_inventory_closings')
    .select('snapshot_items')
    .eq('id', '17f2a3dc-3f3f-4c42-b70c-9c23459b8d17')
    .single();

  if (error) { console.error(error); return; }
  const items = data.snapshot_items;
  const targetAccIds = [1, 106, 873, 107, 1196, 150, 850, 125, 1259, 127, 778, 1261];
  const found = items.filter(it => targetAccIds.includes(Number(it.accountingId)));
  console.log('Sample snapshot items from 2026-10-23 closing:');
  found.forEach(it => {
    console.log(`accountingId: ${it.accountingId} | ${it.productName} | physicalCount: ${it.physicalCount} | bodegaPost10am: ${it.bodegaPost10am}`);
  });
}
check();
