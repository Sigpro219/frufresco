const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: closing } = await supabase
    .from('daily_inventory_closings')
    .select('snapshot_items')
    .eq('closing_date', '2026-10-28')
    .single();

  const items = closing.snapshot_items;
  const targetIds = [107, 1196, 110, 999, 158, 159, 1202, 1316, 767, 866, 844, 1035, 191, 992, 153, 154];
  const found = items.filter(it => targetIds.includes(Number(it.accountingId)) && it.physicalCount > 0);
  console.log('Found targets in closing 2026-10-28:');
  found.forEach(it => {
    console.log(`accId: ${it.accountingId} | ${it.productName} | physicalCount: ${it.physicalCount}`);
  });
}
check();
