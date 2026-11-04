const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const colsubsidioCateringId = "ed010ed8-8e59-4028-9e5d-692764fe42c7";

  // Check client_special_agreements or agreements
  const { data: agrs } = await supabase
    .from("client_special_agreements")
    .select("*")
    .eq("client_id", colsubsidioCateringId);
  console.log("Special agreements for Colsubsidio Catering:", JSON.stringify(agrs, null, 2));

  // Check agreement items if any
  if (agrs && agrs.length > 0) {
    const agrIds = agrs.map(a => a.id);
    const { data: agrItems } = await supabase
      .from("special_agreement_items")
      .select("*")
      .in("agreement_id", agrIds);
    console.log("Agreement items:", JSON.stringify(agrItems, null, 2));
  }

  // Check order templates or recurring orders
  const { data: templates } = await supabase
    .from("order_templates")
    .select("*")
    .eq("client_id", colsubsidioCateringId);
  console.log("Templates:", templates);
}

main().catch(console.error);
