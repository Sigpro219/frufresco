const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: stocks, error } = await supabase
    .from('inventory_stocks')
    .select('product_id, quantity, updated_at, products(id, name, accounting_id, sku)')
    .gt('quantity', 0)
    .order('quantity', { ascending: false });

  if (error) { console.error(error); return; }
  console.log('Positive stocks count in inventory_stocks:', stocks.length);
  console.log('Sample top 10 stocks:', stocks.slice(0, 10).map(s => ({
    name: s.products?.name,
    accId: s.products?.accounting_id,
    sku: s.products?.sku,
    qty: s.quantity,
    updatedAt: s.updated_at
  })));

  // Check 106 vs 873, and 150 vs 850
  const checkAccIds = [106, 873, 150, 850, 778, 1261, 125, 1259, 127];
  const targetStocks = stocks.filter(s => checkAccIds.includes(Number(s.products?.accounting_id)));
  console.log('\nSpecific SKUs in current inventory_stocks:');
  targetStocks.forEach(s => {
    console.log(`  ${s.products?.accounting_id} | ${s.products?.name} | qty: ${s.quantity}`);
  });
}
check();
