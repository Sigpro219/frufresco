const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

async function reconcile() {
    console.log(`🚀 Iniciando reconciliación de Maestro desde Excel (Modo Robusto)...`);
    
    // Configuración de Entornos
    const ENTORNOS = [
        { name: 'SHOWCASE', file: '.env.showcase' },
        { name: 'TENANT_1 (FRUFRESCO)', file: '.env.tenant1_production' }
    ];

    const EXCEL_PATH = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\full_maestro_2026-03-19.xlsx";
    const workbook = xlsx.readFile(EXCEL_PATH);
    const excelData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    for (const envInfo of ENTORNOS) {
        console.log(`\n--- Procesando ${envInfo.name} (${envInfo.file}) ---`);
        
        // Cargar y LIMPIAR agresivamente
        const envPath = path.resolve(process.cwd(), envInfo.file);
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        
        const url = (envConfig.NEXT_PUBLIC_SUPABASE_URL || '').replace(/['"]/g, '').trim();
        const key = (envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').replace(/['"]/g, '').trim();

        if (!url || !key) {
            console.error(`❌ Faltan credenciales en ${envInfo.file}`);
            continue;
        }

        console.log(`📡 Conectando a ${url.substring(0, 20)}...`);

        const supabase = createClient(url, key);

        const { data: dbProducts, error } = await supabase.from('products').select('id, category, sku, name');
        if (error) {
            console.error(`❌ Error en ${envInfo.name}:`, error.message);
            continue;
        }

        let updateList = [];
        for (const row of excelData) {
            const dbProd = dbProducts.find(p => p.id === row.ID_INTERNO);
            if (dbProd && dbProd.category !== row.Categoria) {
                const suffix = dbProd.sku ? dbProd.sku.split('-').pop() : '0000';
                updateList.push({
                    id: dbProd.id,
                    name: dbProd.name,
                    oldCat: dbProd.category,
                    newCat: row.Categoria,
                    oldSku: dbProd.sku,
                    newSku: `${row.Categoria}-${suffix}`
                });
            }
        }

        if (updateList.length > 0) {
            console.log(`⚠️ Aplicando ${updateList.length} cambios...`);
            for (const item of updateList) {
                const { error: updErr } = await supabase
                    .from('products')
                    .update({ category: item.newCat, sku: item.newSku })
                    .eq('id', item.id);
                
                if (updErr) {
                    console.error(`   ❌ Error en ${item.name}:`, updErr.message);
                } else {
                    console.log(`   ✅ ${item.name}: ${item.oldSku} -> ${item.newSku}`);
                }
            }
        } else {
            console.log(`✨ Todo síncrono en ${envInfo.name}.`);
        }
    }
    console.log(`\n🎉 Reconciliación finalizada.`);
}

reconcile();
