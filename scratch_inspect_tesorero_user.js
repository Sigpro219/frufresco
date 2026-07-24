const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
    console.log('=== INSPECTING PROFILES ===');
    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, contact_name, company_name, role, custom_permissions')
        .or('contact_name.ilike.%GUASCA%,company_name.ilike.%GUASCA%,role.ilike.%TESORERO%');

    if (pErr) {
        console.error('Error querying profiles:', pErr);
    } else {
        console.log('Matching profiles count:', profiles?.length);
        console.log('Profiles data:', JSON.stringify(profiles, null, 2));
    }

    console.log('\n=== INSPECTING APP_SETTINGS (system_roles) ===');
    const { data: setting, error: sErr } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', 'system_roles')
        .maybeSingle();

    if (sErr) {
        console.error('Error querying system_roles setting:', sErr);
    } else {
        try {
            const roles = JSON.parse(setting.value);
            const tesoreroRole = roles.find(r => r.value === 'TESORERO');
            console.log('TESORERO role config in system_roles:', JSON.stringify(tesoreroRole, null, 2));
        } catch (e) {
            console.error('Error parsing system_roles:', e);
        }
    }
}

inspect();
