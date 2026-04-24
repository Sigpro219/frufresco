const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1].trim()] = match[2].trim();
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
    try {
        console.log('🚀 Iniciando sincronización con Excel...');
        
        // 1. Read Excel
        const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\DATA PRODUCTOS A 20 DE FEBRERO DE 2026 (1) (2).xlsx';
        if (!fs.existsSync(filePath)) {
            throw new Error(`Archivo no encontrado: ${filePath}`);
        }
        
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const rows = data.slice(1);
        console.log(`Excel leído: ${rows.length} registros encontrados.`);

        // 2. Fetch DB Products to build ID map and preserve mandatory fields
        console.log('Consultando base de datos para mapeo de UUIDs y campos obligatorios...');
        let allProducts = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: batch, error } = await supabase
                .from('products')
                .select('id, accounting_id, sku, name, category, unit_of_measure, base_price, description, image_url')
                .range(from, from + limit - 1);
            
            if (error) throw error;
            if (batch && batch.length > 0) {
                allProducts = [...allProducts, ...batch];
                from += limit;
                if (batch.length < limit) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        const productMap = {};
        allProducts.forEach(p => {
            if (p.accounting_id) productMap[p.accounting_id] = p;
        });
        console.log(`Mapeo listo: ${allProducts.length} productos en DB.`);

        // 3. Prepare Updates
        const updates = [];
        const missingInDB = [];
        
        rows.forEach((row, index) => {
            const accountingId = row[0];
            if (!accountingId || isNaN(accountingId)) return;

            const dbProduct = productMap[accountingId];
            if (!dbProduct) {
                missingInDB.push(accountingId);
                return;
            }

            const active = row[4] === 'SI';
            const web = row[5] === 'SI';
            const rawParentId = row[7];
            
            // Resolve parent UUID
            let parentUuid = null;
            if (rawParentId && !isNaN(rawParentId)) {
                const parentProduct = productMap[rawParentId];
                parentUuid = parentProduct ? parentProduct.id : null;
            }

            updates.push({
                ...dbProduct, // Incluimos todos los campos originales para evitar errores de NOT NULL
                is_active: active,
                show_on_web: web,
                parent_id: parentUuid
            });
        });

        console.log(`\n--- Plan de Ejecución ---`);
        console.log(`Productos a actualizar: ${updates.length}`);
        console.log(`Productos en Excel no encontrados en DB: ${missingInDB.length}`);
        
        if (updates.length === 0) {
            console.log('Nada que actualizar.');
            return;
        }

        // 4. Execute Updates in chunks to avoid timeouts
        console.log('\nEjecutando actualizaciones...');
        const chunkSize = 100;
        for (let i = 0; i < updates.length; i += chunkSize) {
            const chunk = updates.slice(i, i + chunkSize);
            const { error: updateError } = await supabase
                .from('products')
                .upsert(chunk, { onConflict: 'id' });
            
            if (updateError) {
                console.error(`Error en bloque ${i}-${i+chunkSize}:`, updateError.message);
            } else {
                process.stdout.write(`Progreso: ${Math.min(i + chunkSize, updates.length)}/${updates.length}\r`);
            }
        }

        console.log('\n\n✅ Sincronización completada con éxito.');
        if (missingInDB.length > 0) {
            console.log(`Nota: ${missingInDB.length} IDs del Excel no estaban en la DB y fueron ignorados.`);
        }

    } catch (error) {
        console.error('\n❌ Error crítico durante la sincronización:');
        console.error(error.message);
    }
}

sync();
