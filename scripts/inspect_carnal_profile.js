const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectCarnal() {
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, nit, role, created_at, logistics_data, delivery_restrictions')
    .ilike('company_name', '%CARNAL%');

  console.log('Profs found:', profs);

  if (profs && profs.length > 0) {
    const pids = profs.map(p => p.id);
    const { data: pqrs } = await supabase
      .from('customer_service_pqrs')
      .select('id, client_id, order_id, subject, status, created_at')
      .in('client_id', pids);
    console.log('PQRs for Carnal:', pqrs);

    const { data: orders } = await supabase
      .from('orders')
      .select('id, profile_id, status, delivery_date, created_at, logistics_data')
      .in('profile_id', pids)
      .order('delivery_date', { ascending: false })
      .limit(10);
    console.log('Recent orders for Carnal:', orders);
  }
}

inspectCarnal().catch(console.error);
