const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data: profs, error } = await supabase
    .from("profiles")
    .select("id, company_name, razon_social, branch_id")
    .or("company_name.ilike.%batea%,razon_social.ilike.%batea%,company_name.ilike.%barus%,razon_social.ilike.%barus%");

  console.log("Profiles matching batea/barus:", profs);

  if (profs && profs.length > 0) {
    const profIds = profs.map(p => p.id);
    const { data: orders } = await supabase
      .from("orders")
      .select("id, sequence_id, profile_id, delivery_date, status")
      .in("profile_id", profIds)
      .order("delivery_date", { ascending: false })
      .limit(10);
    console.log("Orders found:", orders);

    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options")
        .in("order_id", orderIds);
      
      const prodIds = [...new Set(items.map(i => i.product_id))];
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, unit_of_measure, weight_kg, options")
        .in("id", prodIds);

      const prodMap = new Map((prods || []).map(p => [p.id, p]));
      const enriched = items.map(it => ({
        ...it,
        product: prodMap.get(it.product_id)
      }));
      console.log("Enriched order items:", JSON.stringify(enriched, null, 2));
    }
  }
}

main().catch(console.error);
