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

async function inspectTasks() {
  const { data: tasks } = await supabase
    .from('procurement_tasks')
    .select('id, product_id, total_requested, total_purchased, unit, status, delivery_date')
    .eq('delivery_date', '2026-11-04');
    
  console.log('16 tasks today:', tasks);
}

inspectTasks();
