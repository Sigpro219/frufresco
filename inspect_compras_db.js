const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5NjEsImV4cCI6MjA4ODI1Mjk2MX0.abZSNz1sQI0jGOFXopBOSRj1Hw3coU1sTR7LeuFpn5M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("=== COLOMBIA TIME ===");
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  console.log("Now (Bogota):", now.toString());
  console.log("Current hour:", now.getHours());
  console.log("Date string:", now.toISOString().split("T")[0]);
  
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  console.log("Tomorrow string:", tomorrow.toISOString().split("T")[0]);

  console.log("\n=== PROCUREMENT TASKS ===");
  const { data: tasks, error: tErr } = await supabase
    .from('procurement_tasks')
    .select('*')
    .order('delivery_date', { ascending: false });

  if (tErr) {
    console.error("Error fetching tasks:", tErr);
  } else {
    console.log(`Found ${tasks.length} tasks in total.`);
    tasks.forEach(t => {
      console.log(`- Task ID: ${t.id} | Date: ${t.delivery_date} | Status: ${t.status} | Req: ${t.total_requested} | Pur: ${t.total_purchased} | Prod ID: ${t.product_id}`);
    });
  }

  console.log("\n=== RECENT PURCHASES ===");
  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select('id, task_id, quantity, unit_price, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (pErr) {
    console.error("Error fetching purchases:", pErr);
  } else {
    console.log(`Recent purchases count: ${purchases.length}`);
    purchases.forEach(p => {
      console.log(`- Purchase ID: ${p.id} | Task ID: ${p.task_id} | Qty: ${p.quantity} | Status: ${p.status} | Created At: ${p.created_at}`);
    });
  }
}

inspect();
