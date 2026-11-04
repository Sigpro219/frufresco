const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Let's find any item where variant_label or nickname or selected_options has '500 gr' or quantity is 1.25 or 2.5
  const { data: items } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options, orders(sequence_id, delivery_date, profiles(company_name, razon_social))")
    .or("quantity.eq.1.25,quantity.eq.2.5,variant_label.ilike.%500 gr%,nickname.ilike.%500 gr%");

  console.log(`Found ${items ? items.length : 0} matching items`);
  for (const it of items || []) {
    if (it.orders?.profiles?.company_name?.toLowerCase().includes("batea") || 
        it.orders?.profiles?.razon_social?.toLowerCase().includes("batea") ||
        it.orders?.profiles?.company_name?.toLowerCase().includes("barus") ||
        it.orders?.profiles?.razon_social?.toLowerCase().includes("barus")) {
      console.log({
        orderSeq: it.orders?.sequence_id,
        date: it.orders?.delivery_date,
        client: it.orders?.profiles?.company_name || it.orders?.profiles?.razon_social,
        quantity: it.quantity,
        unit: it.unit,
        nickname: it.nickname,
        variant_label: it.variant_label,
        selected_options: it.selected_options
      });
    }
  }
}

main().catch(console.error);
