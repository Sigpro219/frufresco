const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const filePath = 'C:\\Users\\German Higuera\\AppData\\Local\\Packages\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\\LocalState\\sessions\\8528AF53021D3746A22E37E5ADC7820EDFB626CA\\transfers\\2026-17\\Base de datos - proveedores completa.xlsx';

async function importPremiumProviders() {
    try {
        console.log('Reading Premium Excel...');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const providers = [];
        // Headers are in index 0, data starts from index 1
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row[1] || !row[3]) continue; // Skip if no name or id

            const rawId = row[3].toString();
            const nit = rawId.replace(/[^\d-]/g, '').trim();

            // Mutually exclusive billing type logic
            let billingType = null;
            if (row[12] && row[12].toString().trim().toUpperCase() !== '') billingType = 'soporte';
            if (row[13] && row[13].toString().trim().toUpperCase() !== '') billingType = 'electronica';

            providers.push({
                name: row[1].toString().trim().toUpperCase(),
                document_type: row[2] ? row[2].toString().trim() : 'NIT',
                tax_id: nit,
                category: row[4] ? row[4].toString().trim() : null,
                product: row[5] ? row[5].toString().trim() : null,
                bank_name: row[6] ? row[6].toString().trim() : null,
                bank_account_type: row[7] ? row[7].toString().trim().toLowerCase() : null,
                bank_account_number: row[8] ? row[8].toString().trim() : null,
                contact_name: row[9] ? row[9].toString().trim() : null,
                phone: row[10] ? row[10].toString().trim() : null,
                payment_condition: row[11] ? row[11].toString().trim() : null,
                billing_type: billingType,
                observations: row[14] ? row[14].toString().trim() : null,
                type: 'credito', // Business rule: all from this file are credit
                is_active: true
            });
        }

        console.log(`Ready to import ${providers.length} premium providers.`);

        const chunkSize = 50;
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
        }

        console.log(`\n✅ Importación Premium completada: ${successCount} proveedores de crédito actualizados.`);

    } catch (error) {
        console.error('CRITICAL ERROR:', error.message);
    }
}

importPremiumProviders();
