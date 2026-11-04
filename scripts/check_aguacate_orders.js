const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Let's find orders on 2026-10-24
  const { data: orders } = await supabase
    .from("orders")
    .select("id, sequence_id, delivery_date, profiles(company_name, razon_social)")
    .eq("delivery_date", "2026-10-24");

  console.log(`Found ${orders ? orders.length : 0} orders on 2026-10-24`);

  const orderIds = (orders || []).map(o => o.id);
  const { data: items } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options")
    .in("order_id", orderIds);

  const prodIds = [...new Set((items || []).map(i => i.product_id))];
  const { data: prods } = await supabase
    .from("products")
    .select("id, name, unit_of_measure, weight_kg")
    .in("id", prodIds);
  const prodMap = new Map((prods || []).map(p => [p.id, p]));

  const orderMap = new Map((orders || []).map(o => [o.id, o]));

  const aguacateItems = (items || []).filter(i => {
    const p = prodMap.get(i.product_id);
    return p && p.name.toLowerCase().includes("aguacate");
  });

  console.log("Aguacate items on 2026-10-24:");
  for (const item of aguacateItems) {
    const o = orderMap.get(item.order_id);
    const p = prodMap.get(item.product_id);
    console.log({
      orderSeq: o.sequence_id,
      client: o.profiles?.company_name || o.profiles?.razon_social,
      product: p.name,
      p_uom: p.unit_of_measure,
      p_weight: p.weight_kg,
      item_quantity: item.quantity,
      item_unit: item.unit,
      nickname: item.nickname,
      variant_label: item.variant_label,
      selected_options: item.selected_options
    });
  }
}

main().catch(console.error);
