const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data: closings } = await supabase
    .from("daily_inventory_closings")
    .select("id, closing_date, closed_at, created_at, is_locked, total_physical, total_calculated")
    .order("closing_date", { ascending: false });

  console.log("All closings in DB:");
  console.table(closings);
}

main().catch(console.error);
