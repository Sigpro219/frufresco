import { supabase } from './src/lib/supabase';
async function run() {
    const { data, error } = await supabase.from('purchases').select('*').limit(1);
    console.log(data ? Object.keys(data[0] || {}) : error);
}
run();
