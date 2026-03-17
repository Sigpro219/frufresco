import { createClient } from '@supabase/supabase-js';

// Configuración de los Supabases conocidos (Esto vendrá de la DB del CORE en el futuro)
const CORE_CONFIG = {
    url: 'https://kuxnixwoacwsotcilhuz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
};

async function getTenants() {
    const supabase = createClient(CORE_CONFIG.url, CORE_CONFIG.key);
    const { data, error } = await supabase.from('fleet_tenants').select('*');
    if (error) {
        console.error('❌ Error cargando flota:', error.message);
        return [];
    }
    return data;
}

async function syncTenant(tenant) {
    console.log(`\n🚀 Inyectando actualización en: ${tenant.tenant_name}...`);
    const supabase = createClient(tenant.supabase_url, tenant.service_role_key);
    const now = new Date().toISOString();

    const updates = [
        { key: 'last_core_sync', value: now },
        { key: 'app_name', value: tenant.branding_config.app_name },
        { key: 'app_logo_url', value: tenant.branding_config.app_logo_url },
        { key: 'system_status', value: tenant.status }
    ];

    for (const item of updates) {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key: item.key, value: item.value }, { onConflict: 'key' });
        
        if (error) console.error(`   ❌ Error en ${item.key}:`, error.message);
        else console.log(`   ✅ ${item.key} OK`);
    }
}

async function runFleetSync() {
    console.log('--- COMANDO MAESTRO DE FLOTA: INICIANDO SINCRONIZACIÓN ---');
    
    // 1. Obtener toda la flota desde el CORE
    const fleet = await getTenants();
    
    if (fleet.length === 0) {
        console.warn('⚠️ No se encontraron tenantes registrados en la flota.');
        return;
    }

    // 2. Sincronizar uno a uno
    for (const tenant of fleet) {
        await syncTenant(tenant);
    }

    console.log('\n--- PROCESO COMPLETADO ---');
    console.log(`✅ ${fleet.length} instancias sincronizadas.`);
    console.log('Ahora puedes hacer el git push para que Vercel termine el trabajo.');
}

runFleetSync();
