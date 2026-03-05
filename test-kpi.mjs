import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing supabase URL or Key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRoutes() {
  console.log("Fetching routes data to see the true error...");
  const { data, error } = await supabase
    .from('routes')
    .select('id, is_optimized, theoretical_distance_km, theoretical_duration_min, stops_count, created_at, status')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error("Supabase Error Object:", error);
  } else {
    console.log("Success! Data:", data);
  }
}

checkRoutes();
