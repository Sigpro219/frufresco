const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testPurchasesQuery(balanceDate) {
  const startOfDayIso = `${balanceDate}T00:00:00.000Z`;
  const endOfDayIso = `${balanceDate}T23:59:59.999Z`;

  // 1. Task IDs
  const { data: dayTasks } = await supabase
    .from('procurement_tasks')
    .select('id')
    .eq('delivery_date', balanceDate);

  const taskIds = (dayTasks || []).map(t => t.id);
  console.log(`Date ${balanceDate}: ${taskIds.length} tasks found.`);

  // 2. Purchases by task
  let taskPurchases = [];
  if (taskIds.length > 0) {
    const { data } = await supabase
      .from('purchases')
      .select('id, product_id, quantity, unit_price, total_cost, purchase_unit, status, created_at, task_id')
      .in('task_id', taskIds);
    taskPurchases = data || [];
  }

  // 3. Purchases by created_at
  const { data: datePurchases } = await supabase
    .from('purchases')
    .select('id, product_id, quantity, unit_price, total_cost, purchase_unit, status, created_at, task_id')
    .gte('created_at', startOfDayIso)
    .lte('created_at', endOfDayIso);

  // Combine deduped by ID
  const map = new Map();
  [...taskPurchases, ...(datePurchases || [])].forEach(p => {
    map.set(p.id, p);
  });

  const allPurchases = Array.from(map.values());
  console.log(`Total purchases found for ${balanceDate}:`, allPurchases.length);
  return allPurchases;
}

async function run() {
  await testPurchasesQuery('2026-11-04');
  await testPurchasesQuery('2026-10-29');
}
run();
