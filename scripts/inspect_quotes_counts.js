require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data } = await supabase.from('quotes').select('id, status, client_name, quote_number');
    const counts = {};
    data.forEach(q => counts[q.status] = (counts[q.status] || 0) + 1);
    console.log('Quotes by status:', counts);
})();
