const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// DATOS A ACTUALIZAR
const TENANT_NAME = 'FruFresco (Tenant 1)';
const NEW_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

async function updateTenantKey() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log(`Buscando tenant: ${TENANT_NAME}...`);
    
    const { data: tenant, error: fetchError } = await supabase
        .from('fleet_tenants')
        .select('id, tenant_name')
        .eq('tenant_name', TENANT_NAME)
        .single();
        
    if (fetchError) {
        console.error('Error buscando tenant:', fetchError.message);
        return;
    }
    
    console.log(`Encontrado: ${tenant.tenant_name} (ID: ${tenant.id})`);
    console.log('Actualizando Service Role Key...');
    
    const { error: updateError } = await supabase
        .from('fleet_tenants')
        .update({ service_role_key: NEW_SERVICE_ROLE_KEY })
        .eq('id', tenant.id);
        
    if (updateError) {
        console.error('Error al actualizar:', updateError.message);
    } else {
        console.log('✅ Key actualizada exitosamente en la base de datos de la flota.');
        console.log('Ya puedes intentar el Push masivo desde el Command Center.');
    }
}

updateTenantKey();
