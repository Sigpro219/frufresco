const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://csqurhdykbalvlnpowcz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E'
);

async function run() {
  try {
    // 1. Search Olga Ramos
    console.log("=== COLLABORATORS ===");
    const { data: collaborators, error: collError } = await supabase
      .from('collaborators')
      .select('*')
      .ilike('contact_name', '%ramos%');
    if (collError) console.error(collError);
    else console.log(collaborators);

    console.log("\n=== PROFILES ===");
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('contact_name', '%ramos%');
    if (profError) console.error(profError);
    else console.log(profiles);

    // 2. Query RLS policies on orders table
    console.log("\n=== RLS POLICIES ON ORDERS ===");
    const { data: policies, error: polError } = await supabase
      .rpc('execute_sql_raw', { sql_query: "select * from pg_policies where tablename = 'orders';" });
    
    if (polError) {
      console.log("execute_sql_raw RPC failed/not found, querying via postgres directly or printing error:", polError.message);
    } else {
      console.log(policies);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
