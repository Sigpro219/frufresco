const { createClient } = require('@supabase/supabase-js');

const SOURCE_URL = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const SOURCE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU';

const TARGET_URL = 'https://csqurhdykbalvlnpowcz.supabase.co';
const TARGET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const sourceClient = createClient(SOURCE_URL, SOURCE_KEY);
const targetClient = createClient(TARGET_URL, TARGET_KEY);

async function syncPersonnelExpert() {
    console.log('--- 🛡️ SINCRONIZACIÓN DE PERSONAL (VÍA ADMIN API) ---');

    // 1. Obtener los 55 perfiles del origen
    const { data: profiles, error: fetchErr } = await sourceClient.from('profiles').select('*');
    if (fetchErr) return console.error('❌ Error leyendo origen:', fetchErr.message);

    console.log(`🚀 Preparando ${profiles.length} empleados...`);

    // 2. Para cada empleado, asegurar que exista en Auth y luego en Profile
    for (const profile of profiles) {
        process.stdout.write(`👤 Sincronizando ${profile.contact_name || profile.email}... `);

        try {
            // Creamos o actualizamos el usuario en Auth (necesario para la llave foránea)
            // Usamos el ID original para mantener la consistencia
            const { data: user, error: authErr } = await targetClient.auth.admin.createUser({
                id: profile.id,
                email: profile.email || `${profile.id}@temp.frufresco.com`,
                password: 'DummyPassword123!',
                email_confirm: true,
                user_metadata: { role: profile.role }
            });

            if (authErr && !authErr.message.includes('already exists')) {
                console.log(`⚠️ Auth Skip: ${authErr.message}`);
            }

            // Mapeamos solo las columnas que el destino tiene actualmente
            const { data: targetCols } = await targetClient.from('profiles').select('*').limit(1);
            const cols = targetCols && targetCols.length > 0 ? Object.keys(targetCols[0]) : [];
            
            const cleanedProfile = {};
            cols.forEach(c => { if (c in profile) cleanedProfile[c] = profile[c]; });

            // Upsert del perfil
            const { error: profileErr } = await targetClient.from('profiles').upsert(cleanedProfile);
            
            if (profileErr) {
                console.log(`❌ Error: ${profileErr.message}`);
            } else {
                console.log(`✅ OK`);
            }

        } catch (err) {
            console.log(`❌ Fallo crítico: ${err.message}`);
        }
    }

    console.log('\n--- ✨ EL TENANT 1 YA TIENE A TODO EL PERSONAL ---');
}

syncPersonnelExpert();
