const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data: closings, error } = await supabase
    .from("daily_inventory_closings")
    .select("*")
    .order("closing_date", { ascending: false })
    .limit(10);

  console.log("Closings count:", closings ? closings.length : 0);
  console.log("Error if any:", error);

  if (closings && closings.length > 0) {
    closings.forEach(c => {
      console.log(`Closing ID: ${c.id}, Date: ${c.closing_date}, Locked: ${c.is_locked}, CreatedAt: ${c.created_at}`);
      console.log(`  Keys in row:`, Object.keys(c));
      if (Array.isArray(c.snapshot_items)) {
        console.log(`  Items count: ${c.snapshot_items.length}`);
        const aguacate = c.snapshot_items.filter(it => (it.productName || it.name || '').toLowerCase().includes('aguacate'));
        console.log(`  Aguacate items:`, JSON.stringify(aguacate, null, 2));
      }
    });
  }
}

main().catch(console.error);
