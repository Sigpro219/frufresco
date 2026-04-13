const { createClient } = require('@supabase/supabase-js');

/**
 * 🛰️ MASTER MIRROR SCRIPT: CORE -> TENANT 1
 * Este script clona Catálogo, Personal y Ajustes desde el Showcase hacia el Tenant 1.
 */

// --- 🎯 CONFIGURACIÓN DE CONEXIONES ---
const SOURCE = {
    url: 'https://kuxnixwoacwsotcilhuz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
};

const TARGET = {
    url: 'https://csqurhdykbalvlnpowcz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E'
};

const sourceClient = createClient(SOURCE.url, SOURCE.key);
const targetClient = createClient(TARGET.url, TARGET.key);

async function runMirror() {
    console.log('--- 🚀 INICIANDO ESPEJO TOTAL: CORE/SHOWCASE -> TENANT 1 ---');

    // 1. Sincronizar Tablas Base (Productos, Ajustes)
    const tables = [
        { name: 'app_settings', conflict: 'key' },
        { name: 'products', conflict: 'id' },
        { name: 'product_nicknames', conflict: 'id' },
        { name: 'product_conversions', conflict: 'id' }
    ];

    for (const table of tables) {
        process.stdout.write(`🔄 Sincronizando [${table.name}]... `);
        const { data, error } = await sourceClient.from(table.name).select('*');
        if (error) { console.log(`❌ ${error.message}`); continue; }
        
        // Mapeo inteligente (solo lo que el destino aguanta)
        const { data: destSample } = await targetClient.from(table.name).select('*').limit(1);
        const cols = destSample && destSample.length > 0 ? Object.keys(destSample[0]) : null;
        
        const cleaned = data.map(r => {
            if (!cols) return r;
            const obj = {};
            cols.forEach(c => { if (c in r) obj[c] = r[c]; });
            return obj;
        });

        const { error: upsertErr } = await targetClient.from(table.name).upsert(cleaned, { onConflict: table.conflict });
        console.log(upsertErr ? `❌ ${upsertErr.message}` : `✅ OK (${cleaned.length})`);
    }

    // 2. Sincronizar Personal (Auth + Profiles)
    console.log('\n👤 Sincronizando Personal (Auth + Profiles)...');
    const { data: profiles } = await sourceClient.from('profiles').select('*');
    
    for (const p of profiles) {
        process.stdout.write(`   > ${p.contact_name || p.id}: `);
        
        // Crear en Auth (Bypass FK)
        const { error: authErr } = await targetClient.auth.admin.createUser({
            id: p.id,
            email: p.email || `${p.id}@temp.frufresco.com`,
            password: 'DummyPassword123!',
            email_confirm: true
        });

        // Insertar Perfil
        const { data: destProf } = await targetClient.from('profiles').select('*').limit(1);
        const pCols = Object.keys(destProf[0]);
        const cleanP = {};
        pCols.forEach(c => { if (c in p) cleanP[c] = p[c]; });

        const { error: pErr } = await targetClient.from('profiles').upsert(cleanP);
        console.log(pErr ? `❌ ${pErr.message}` : `✅ OK`);
    }

    console.log('\n--- ✨ TENANT 1 ES AHORA UN ESPEJO DEL CORE ---');
}

runMirror();
