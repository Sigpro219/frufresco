require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: p } = await supabase.from('profiles').select('*').limit(1);
    console.log('Profiles columns:', Object.keys(p?.[0] || {}));

    const { data: o } = await supabase.from('orders').select('*').limit(1);
    console.log('Orders columns:', Object.keys(o?.[0] || {}));
})();
