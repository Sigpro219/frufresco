import { supabase } from './src/lib/supabase';
async function run() {
    const { data } = await supabase.from('routes').select('*, route_stops(*)').limit(1);
    console.log(JSON.stringify(data, null, 2));
}
run();
