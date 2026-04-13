const { createClient } = require('@supabase/supabase-js');

// --- 🎯 CONFIGURACIÓN FINAL (MAPEO INTELIGENTE) ---
const SOURCE_URL = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const SOURCE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU';

const TARGET_URL = 'https://csqurhdykbalvlnpowcz.supabase.co';
const TARGET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const sourceClient = createClient(SOURCE_URL, SOURCE_KEY);
const targetClient = createClient(TARGET_URL, TARGET_KEY);

const TABLES_TO_SYNC = [
    { name: 'app_settings', conflict: 'key' },
    { name: 'products', conflict: 'id' },
    { name: 'profiles', conflict: 'id' }
];

async function syncWithMapping() {
    console.log('--- 🚀 CLONACIÓN INTELIGENTE: SHOWCASE -> TENANT 1 ---');

    for (const table of TABLES_TO_SYNC) {
        process.stdout.write(`🔄 Procesando [${table.name}]... `);
        
        try {
            // 1. Obtener columnas del destino para filtrar
            const { data: targetColsData, error: targetColsError } = await targetClient.from(table.name).select('*').limit(1);
            if (targetColsError) throw new Error(`Error leyendo estructura destino: ${targetColsError.message}`);
            const targetCols = targetColsData && targetColsData.length > 0 ? Object.keys(targetColsData[0]) : null;

            // 2. Extraer del Origen
            const { data: sourceData, error: sourceError } = await sourceClient.from(table.name).select('*');
            if (sourceError) throw new Error(`Error leyendo origen: ${sourceError.message}`);
            if (!sourceData || sourceData.length === 0) {
                console.log('⚠️ Origen vacío.');
                continue;
            }

            // 3. Filtrar columnas "huérfanas"
            const cleanedData = sourceData.map(row => {
                const cleanedRow = {};
                // Si destino está vacío, tomamos todo, de lo contrario solo lo que el destino acepte
                if (!targetCols) return row; 
                targetCols.forEach(col => {
                    if (col in row) cleanedRow[col] = row[col];
                });
                return cleanedRow;
            });

            // 4. Upsert
            const { error: upsertError } = await targetClient.from(table.name).upsert(cleanedData, { onConflict: table.conflict });
            if (upsertError) throw new Error(`Error al insertar: ${upsertError.message}`);

            console.log(`✅ OK (${cleanedData.length} registros).`);
            
        } catch (err) {
            console.log(`\n❌ Error en ${table.name}: ${err.message}`);
        }
    }
    console.log('\n--- ✨ SINCRONIZACIÓN FINALIZADA ---');
}

syncWithMapping();
