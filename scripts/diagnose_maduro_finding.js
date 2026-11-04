const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Let's find orders for COLSUBSIDIO - CATERING
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, company_name, razon_social, branch_id")
    .ilike("company_name", "%colsubsidio%catering%");

  console.log("Profiles matching colsubsidio catering:", profs);
  if (!profs || profs.length === 0) return;

  const profIds = profs.map(p => p.id);
  const { data: orders } = await supabase
    .from("orders")
    .select("id, sequence_id, delivery_date, created_at")
    .in("profile_id", profIds)
    .order("delivery_date", { ascending: false })
    .limit(10);

  console.log("Orders found:", orders);

  if (orders && orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options, quality_notes")
      .in("order_id", orderIds)
      .eq("quantity", 20);

    console.log("Items with quantity = 20:", JSON.stringify(items, null, 2));

    const allItemProdIds = [...new Set((items || []).map(i => i.product_id))];
    const { data: prods } = await supabase
      .from("products")
      .select("id, name, unit_of_measure, weight_kg, options")
      .in("id", allItemProdIds);
    console.log("Products referenced:", prods);
  }
}

main().catch(console.error);
