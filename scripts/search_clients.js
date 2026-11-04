const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, commercial_name")
    .limit(20);
  console.log("Sample clients:", clients);
  console.log("Error if any:", error);

  const { data: searchClients } = await supabase
    .from("clients")
    .select("id, name, commercial_name")
    .textSearch("name", "batea | barus | corrales", { config: "spanish" });
  console.log("textSearch result:", searchClients);
}

main().catch(console.error);
