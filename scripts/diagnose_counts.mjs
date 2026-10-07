import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  console.log('--- 1. ORDER DRAFTS AUDIT ---');
  // Fetch drafts
  const { data: drafts, error: dErr } = await supabase
    .from('order_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (dErr) {
    console.error('Error fetching drafts:', dErr);
    return;
  }

  console.log(`Total drafts fetched (limit 100): ${drafts.length}`);
  if (drafts.length > 0) {
    console.log('Available columns in order_drafts:', Object.keys(drafts[0]));
  }

  // Filter for today (Bogota timezone UTC-5: 2026-10-05)
  const draftsToday = drafts.filter(d => {
    const date = new Date(d.created_at);
    const bogotaStr = date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    return bogotaStr === '2026-10-05';
  });

  console.log(`Drafts created today (2026-10-05 Colombia): ${draftsToday.length}`);

  const statusCounts = {};
  const statusWithOrder = {};

  draftsToday.forEach(d => {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    // Check order reference
    const hasOrder = Boolean(d.order_id || (d.metadata && (typeof d.metadata === 'object' ? d.metadata.orderId : false)));
    if (hasOrder) {
      statusWithOrder[d.status] = (statusWithOrder[d.status] || 0) + 1;
    }
  });

  console.log('Today drafts by status:', statusCounts);
  console.log('Today drafts with order reference:', statusWithOrder);

  // Check all pending drafts
  const { count: pendingTotal } = await supabase
    .from('order_drafts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { count: pending30Days } = await supabase
    .from('order_drafts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gte('created_at', thirtyDaysAgo.toISOString());

  console.log(`All-time pending drafts: ${pendingTotal}`);
  console.log(`30-day pending drafts: ${pending30Days}`);

  // Print subjects and statuses of today drafts
  console.log('\n--- TODAY DRAFTS LIST ---');
  draftsToday.forEach((d, i) => {
    console.log(`[${i+1}] status=${d.status} order_id=${d.order_id || 'none'} subj="${d.email_subject?.slice(0, 45)}" created=${d.created_at}`);
  });

  console.log('\n--- 2. ORDERS AUDIT ---');
  // Check orders
  const { data: ordersToday } = await supabase
    .from('orders')
    .select('id, order_number, status, delivery_date, created_at, channel, total_amount')
    .eq('delivery_date', '2026-10-05');

  const { data: ordersTomorrow } = await supabase
    .from('orders')
    .select('id, order_number, status, delivery_date, created_at, channel, total_amount')
    .eq('delivery_date', '2026-10-06');

  console.log(`Orders with delivery_date = 2026-10-05 (Para entrega hoy): ${ordersToday?.length || 0}`);
  const ordersTodayByStatus = {};
  ordersToday?.forEach(o => {
    ordersTodayByStatus[o.status] = (ordersTodayByStatus[o.status] || 0) + 1;
  });
  console.log('Orders 2026-10-05 by status:', ordersTodayByStatus);

  console.log(`Orders with delivery_date = 2026-10-06 (Para entrega mañana): ${ordersTomorrow?.length || 0}`);
  const ordersTomorrowByStatus = {};
  ordersTomorrow?.forEach(o => {
    ordersTomorrowByStatus[o.status] = (ordersTomorrowByStatus[o.status] || 0) + 1;
  });
  console.log('Orders 2026-10-06 by status:', ordersTomorrowByStatus);

  // Orders created today (2026-10-05 Colombia)
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id, order_number, status, delivery_date, created_at, channel')
    .order('created_at', { ascending: false })
    .limit(200);

  const ordersCreatedToday = allOrders?.filter(o => {
    const date = new Date(o.created_at);
    const bogotaStr = date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    return bogotaStr === '2026-10-05';
  });

  console.log(`Orders CREATED today (2026-10-05): ${ordersCreatedToday?.length || 0}`);
  const createdByDelivery = {};
  ordersCreatedToday?.forEach(o => {
    createdByDelivery[o.delivery_date] = (createdByDelivery[o.delivery_date] || 0) + 1;
  });
  console.log('Orders created today grouped by delivery_date:', createdByDelivery);
}

run();
