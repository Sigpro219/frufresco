const projectPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco';
const { createClient } = require(`${projectPath}/node_modules/@supabase/supabase-js`);
const XLSX = require(`${projectPath}/node_modules/xlsx`);
const fs = require('fs');
const path = require('path');
const dotenv = require(`${projectPath}/node_modules/dotenv`);

// Load env
const envPath = path.resolve(projectPath, '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);
const excelPath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\LISTAS DE cotización.xlsx';

async function seed() {
    console.log('🌱 Starting quote templates seeding...');
    
    try {
        // 1. Fetch all products from Supabase to map accounting_id to UUID
        console.log('📡 Fetching products from database...');
        let allProducts = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const { data, error } = await supabase
                .from('products')
                .select('id, accounting_id')
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (error) throw error;
            if (!data || data.length === 0) {
                hasMore = false;
            } else {
                allProducts = [...allProducts, ...data];
                page++;
            }
        }
        
        console.log(`✅ Loaded ${allProducts.length} products for mapping.`);
        
        // Map accounting_id to UUID
        const productMap = new Map();
        allProducts.forEach(p => {
            if (p.accounting_id !== null && p.accounting_id !== undefined) {
                productMap.set(Number(p.accounting_id), p.id);
            }
        });
        
        // 2. Read Excel
        console.log('📖 Reading Excel file:', excelPath);
        const workbook = XLSX.readFile(excelPath);
        
        const sheetConfigs = [
            { sheetName: 'general', dbName: 'Lista Larga', desc: 'Lista general con 352 productos', idCol: 'ID' },
            { sheetName: 'Mediana', dbName: 'Lista Mediana', desc: 'Lista mediana con 143 productos', idCol: 'idProducto' },
            { sheetName: 'Pequeña', dbName: 'Lista Pequeña', desc: 'Lista pequeña con 71 productos', idCol: 'idProducto' }
        ];
        
        // 3. Clear existing templates to avoid duplicates (idempotency)
        console.log('🧹 Clearing old templates...');
        const { error: clearErr } = await supabase
            .from('quote_templates')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
            
        if (clearErr) {
            console.warn('⚠️ Warning clearing old templates:', clearErr.message);
        }
        
        for (const config of sheetConfigs) {
            const sheet = workbook.Sheets[config.sheetName];
            if (!sheet) {
                console.error(`❌ Sheet not found: ${config.sheetName}`);
                continue;
            }
            
            const rows = XLSX.utils.sheet_to_json(sheet);
            console.log(`📊 Processing sheet '${config.sheetName}' with ${rows.length} rows...`);
            
            // Create Template
            const { data: templateData, error: templateErr } = await supabase
                .from('quote_templates')
                .insert([{
                    name: config.dbName,
                    description: config.desc
                }])
                .select()
                .single();
                
            if (templateErr) throw templateErr;
            const templateId = templateData.id;
            console.log(` Created template '${config.dbName}' with ID: ${templateId}`);
            
            // Map items
            const templateItems = [];
            let unmappedCount = 0;
            const uniqueProductIds = new Set();
            
            for (const row of rows) {
                const rawId = row[config.idCol];
                if (!rawId) continue;
                
                const accountingId = Number(rawId);
                const productUuid = productMap.get(accountingId);
                
                if (productUuid) {
                    if (!uniqueProductIds.has(productUuid)) {
                        uniqueProductIds.add(productUuid);
                        templateItems.push({
                            template_id: templateId,
                            product_id: productUuid
                        });
                    }
                } else {
                    unmappedCount++;
                }
            }
            
            // Insert template items in chunks to avoid size limits
            if (templateItems.length > 0) {
                console.log(`📥 Inserting ${templateItems.length} items (unmapped: ${unmappedCount})...`);
                const chunkSize = 100;
                for (let i = 0; i < templateItems.length; i += chunkSize) {
                    const chunk = templateItems.slice(i, i + chunkSize);
                    const { error: itemsErr } = await supabase
                        .from('quote_template_items')
                        .insert(chunk);
                        
                    if (itemsErr) throw itemsErr;
                }
                console.log(`✅ Seeded '${config.dbName}' template items successfully.`);
            } else {
                console.warn(`⚠️ No valid items found for template '${config.dbName}'`);
            }
        }
        
        console.log('🎉 Seeding completed successfully!');
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
    }
}

seed();
