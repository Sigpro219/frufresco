const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
    console.log('--- Updating GUASCA ROJAS ANDRES custom_permissions via Service Role ---');
    const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .update({
            custom_permissions: [
                '+admin.procurement.providers',
                '+admin.procurement.providers.view',
                '+admin.procurement.providers.edit',
                '+admin.procurement'
            ]
        })
        .or('contact_name.ilike.%GUASCA%,company_name.ilike.%GUASCA%,role.eq.TESORERO')
        .select();

    if (pErr) {
        console.error('Error updating profiles:', pErr);
    } else {
        console.log('✅ Profiles updated successfully:', pData);
    }

    console.log('\n--- Updating app_settings system_roles via Service Role ---');
    const { data: settingData, error: fetchErr } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', 'system_roles')
        .maybeSingle();

    if (!fetchErr && settingData?.value) {
        try {
            const roles = JSON.parse(settingData.value);
            console.log('Existing system_roles count:', roles.length);
            
            let foundTesorero = false;
            const updatedRoles = roles.map(r => {
                if (r.value === 'TESORERO' || r.value === 'tesorero') {
                    foundTesorero = true;
                    const perms = new Set(r.permissions || []);
                    perms.add('admin.procurement.providers');
                    perms.add('admin.procurement.providers.view');
                    perms.add('admin.procurement.providers.edit');
                    perms.add('admin.procurement');
                    perms.add('admin.procurement.treasury');
                    perms.add('admin.procurement.cash');
                    r.permissions = Array.from(perms);
                }
                return r;
            });

            if (!foundTesorero) {
                console.log('Adding missing TESORERO role to system_roles!');
                updatedRoles.push({
                    value: 'TESORERO',
                    label: 'Tesorero',
                    permissions: [
                        'admin.procurement.providers',
                        'admin.procurement.providers.view',
                        'admin.procurement.providers.edit',
                        'admin.procurement',
                        'admin.procurement.treasury',
                        'admin.procurement.cash'
                    ]
                });
            }

            const { error: saveErr } = await supabase
                .from('app_settings')
                .update({ value: JSON.stringify(updatedRoles) })
                .eq('key', 'system_roles');

            if (saveErr) {
                console.error('Error saving updated system_roles:', saveErr);
            } else {
                console.log('✅ system_roles updated successfully in app_settings table!');
            }
        } catch (e) {
            console.error('Error parsing system_roles:', e);
        }
    }
}

run();
