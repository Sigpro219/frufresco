const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://csqurhdykbalvlnpowcz.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';
const EXCEL_PATH = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD PRODUCTOS 25 ABRIL-INVESTMENTS CORTES SAS.xlsx';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runUpdate() {
    try {
        console.log('--- INICIANDO ACTUALIZACIÓN MASIVA (CON PAGINACIÓN) ---');
        
        const workbook = XLSX.readFile(EXCEL_PATH);
        const excelData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        console.log(`Excel leído: ${excelData.length} registros encontrados.`);

        // Obtener TODOS los productos usando paginación
        let existingProducts = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('products')
                .select('id, accounting_id, name')
                .range(from, from + limit - 1);
            
            if (error) throw error;
            if (data.length > 0) {
                existingProducts = [...existingProducts, ...data];
                from += limit;
                if (data.length < limit) hasMore = false;
            } else {
                hasMore = false;
            }
        }
        
        const productMap = {};
        existingProducts.forEach(p => {
            if (p.accounting_id) productMap[p.accounting_id] = p.id;
        });
        console.log(`Base de datos: ${existingProducts.length} productos cargados.`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;

        const BATCH_SIZE = 50;
        for (let i = 0; i < excelData.length; i += BATCH_SIZE) {
            const batch = excelData.slice(i, i + BATCH_SIZE);
            
            await Promise.all(batch.map(async (row) => {
                const accountingId = row['Producto'];
                const productId = productMap[accountingId];

                if (!productId) {
                    skipped++;
                    return;
                }

                const updatePayload = {
                    inventory_group: row['GRUPO INVENTARIO'] || null,
                    purchase_sublist: row['SUBLISTA DE COMPRA'] || null,
                    buying_team: row['Comprador'] || null,
                    procurement_method: row['__EMPTY'] || null,
                    is_active: row['ACTIVO'] === 'SI',
                    show_on_web: row['WEB INSTITUCIONAL'] === 'SI',
                    iva_rate: parseInt(row['IVA'] || '0')
                };

                const { error: updateError } = await supabase
                    .from('products')
                    .update(updatePayload)
                    .eq('id', productId);

                if (updateError) {
                    console.error(`Error actualizando ID ${accountingId}:`, updateError.message);
                    errors++;
                } else {
                    updated++;
                }
            }));

            if (updated % 200 === 0) console.log(`Progreso: ${updated} procesados...`);
        }

        console.log('\n--- RESUMEN FINAL ---');
        console.log(`Actualizados con éxito: ${updated}`);
        console.log(`Omitidos (no encontrados por ID): ${skipped}`);
        console.log(`Errores: ${errors}`);

    } catch (err) {
        console.error('Falla crítica:', err.message);
    }
}

runUpdate();
