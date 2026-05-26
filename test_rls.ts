import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function run() {
    // Attempt to insert a dummy route with service key (bypasses RLS)
    const { data, error } = await supabase.from('routes').insert({
        vehicle_plate: 'TEST-123',
        status: 'loading'
    }).select().single();
    
    console.log("INSERT RESULT:", data, error);
    
    if (data) {
        // delete it
        await supabase.from('routes').delete().eq('id', data.id);
    }
}
run();
