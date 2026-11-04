require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectTemplates() {
    const { data, error } = await supabase.from('quote_templates').select('id, name').order('name');
    if (error) console.error(error);
    else {
        console.log('Total templates count:', data.length);
        console.log('Template names:', data.map(t => t.name));
    }

    const { data: matrices, error: mErr } = await supabase.from('profiles').select('id, company_name, razon_social, nit').eq('role', 'b2b_client').is('parent_id', null).order('company_name');
    if (mErr) console.error(mErr);
    else {
        console.log('Total Casas Matrices count:', matrices.length);
        console.log('Matrices sample (first 10):', matrices.slice(0, 10).map(m => m.company_name || m.razon_social));
    }
}
inspectTemplates();
