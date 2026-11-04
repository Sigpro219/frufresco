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

async function checkTasks() {
  const { data: tasks4 } = await supabase.from('procurement_tasks').select('id, product_id, total_requested, total_purchased, status, delivery_date').eq('delivery_date', '2026-11-04');
  console.log('Tasks for 2026-11-04:', tasks4?.length);
  
  const { data: tasks5 } = await supabase.from('procurement_tasks').select('id, product_id, total_requested, total_purchased, status, delivery_date').eq('delivery_date', '2026-11-05');
  console.log('Tasks for 2026-11-05:', tasks5?.length);

  const { data: pToday } = await supabase.from('purchases').select('id, product_id, quantity, created_at').gte('created_at', '2026-11-04T00:00:00Z').lte('created_at', '2026-11-04T23:59:59Z');
  console.log('Purchases with created_at today:', pToday);
}

checkTasks();
