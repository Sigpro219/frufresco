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

  const roja = closing.snapshot_items.filter(it => [107, 1196].includes(Number(it.accountingId)));
  console.log('Roja in closing 2026-10-28:');
  roja.forEach(it => {
    console.log(`accountingId: ${it.accountingId} | ${it.productName} | physical: ${it.physicalCount}`);
  });

  const { data: stocks } = await supabase
    .from('inventory_stocks')
    .select('quantity, products(accounting_id, name)')
    .eq('warehouse_id', 'd606c381-45bd-45f3-a0a9-9b8b3b196ac3');

  const rojaStocks = stocks.filter(s => s.products && [107, 1196].includes(Number(s.products.accounting_id)));
  console.log('Roja in stocks:');
  rojaStocks.forEach(s => {
    console.log(`accountingId: ${s.products.accounting_id} | ${s.products.name} | qty: ${s.quantity}`);
  });
}
check();
