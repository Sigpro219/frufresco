const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\PROVEEDORES finales.xlsx';

async function importProviders() {
    try {
        console.log('Reading Excel...');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const providers = [];
        // Data starts from index 3 (Row 4) based on previous analysis
        for (let i = 3; i < data.length; i++) {
            const row = data[i];
            if (!row[2] || !row[3]) continue; 

            const rawId = row[3].toString();
            // Clean NIT/CC: numbers and dashes only
            const nit = rawId.replace(/[^\d-]/g, '').trim();

            providers.push({
                name: row[2].toString().trim().toUpperCase(),
                tax_id: nit,
                address: row[4] ? row[4].toString().trim() : null,
                phone: row[5] ? row[5].toString().trim() : null,
                city: row[6] ? row[6].toString().trim() : 'Bogotá D.C.',
                type: 'contado',
                is_active: true
            });
        }

        console.log(`Ready to import ${providers.length} providers.`);

        // Batch processing to avoid timeouts
        const chunkSize = 100;
        let successCount = 0;

        for (let i = 0; i < providers.length; i += chunkSize) {
            const chunk = providers.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('providers')
                .upsert(chunk, { onConflict: 'tax_id' });

            if (error) {
                console.error(`Error in batch ${i/chunkSize}:`, error.message);
            } else {
                successCount += chunk.length;
            }

            if (i % 500 === 0) {
                console.log(`Progress: ${i} / ${providers.length} providers processed...`);
            }
        }

        console.log(`\n✅ Importación completada: ${successCount} proveedores procesados con éxito.`);

    } catch (error) {
        console.error('CRITICAL ERROR:', error.message);
    }
}

importProviders();
