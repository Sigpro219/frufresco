const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const supabase = createClient('https://csqurhdykbalvlnpowcz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E');
const directoryPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos';
const mappingPath = path.join(directoryPath, 'Mapeo_Filtro_Credito_Ginger.xlsx');

const excelFiles = [
    '01.ENERO 2025-BD COSTOS-.xlsx', '02.FEBRERO 2025-BD COSTOS-.xlsx', '03.MARZO 2025-BD COSTOS.xlsx',
    '04.ABRIL 2025-BD COSTOS.xlsx', '05.MAYO 2025-BD COSTOS-.xlsx', '06.JUNIO 2025-BD COSTOS-.xlsx',
    '07.JULIO 2025-BD COSTOS.xlsx', '08.AGOSTO 2025-BD COSTOS.xlsx', '09.SEPTIEMBRE 2025-BD COSTOS.xlsx',
    '10.OCTUBRE 2025-BD COSTOS.xlsx', '11.NOVIEMBRE 2025 -BD COSTOS.xlsx', '12.DICIEMBRE 2025-BD COSTOS.xlsx',
    '2026-ENERO BD COSTOS.xlsx', '2026-FEBRERO BD COSTOS.xlsx', '2026-MARZO BD COSTOS.xlsx'
];

async function runIngestion() {
    try {
        console.log('🚀 Iniciando Ingesta Global (Modo Matriz Pura)...');

        await supabase.from('purchases').delete().eq('is_pre_digital_entry', true);

        // A. Mapeo de IDs (Columna B)
        const mappingWorkbook = XLSX.readFile(mappingPath);
        const mappingSheet = mappingWorkbook.Sheets[mappingWorkbook.SheetNames[0]];
        const mappingRows = XLSX.utils.sheet_to_json(mappingSheet);
        const idMap = new Map();
        mappingRows.forEach(row => {
            const name = (row['Nombre en Excel (Crédito/Ginger)'] || '').toString().trim().toUpperCase();
            const id = row['ID Sugerido (Encontrado en Efectivo)'];
            if (name && id) idMap.set(name, id.toString());
        });

        // B. Productos de DB
        const { data: dbProducts } = await supabase.from('products').select('id, accounting_id, sku');
        const uuidMap = new Map();
        dbProducts.forEach(p => {
            if (p.accounting_id) uuidMap.set(p.accounting_id.toString(), p.id);
            if (p.sku) uuidMap.set(p.sku.toString(), p.id);
        });
        console.log(`📦 Productos en DB cargados: ${uuidMap.size}`);

        let totalInserted = 0;

        for (const fileName of excelFiles) {
            const filePath = path.join(directoryPath, fileName);
            if (!fs.existsSync(filePath)) continue;

            const workbook = XLSX.readFile(filePath);
            const purchasesToInsert = [];

            // 1. PROCESAR EFECTIVO (MATRIZ)
            const cashSheet = workbook.Sheets['BD EFECTIVO'];
            if (cashSheet) {
                const raw = XLSX.utils.sheet_to_json(cashSheet, { header: 1 });
                const headers = raw[0] || [];
                const dataRows = raw.slice(1);

                // Identificar columnas de fecha
                const dateCols = [];
                headers.forEach((h, idx) => {
                    if (!isNaN(h) && h > 40000) dateCols.push({ idx, serial: h });
                });

                dataRows.forEach(row => {
                    if (!row || row.length < 2) return;
                    const accountingId = (row[1] || '').toString();
                    const productId = uuidMap.get(accountingId);
                    if (!productId) return;

                    dateCols.forEach(col => {
                        const price = parseFloat(row[col.idx]);
                        if (!isNaN(price) && price > 0) {
                            const date = new Date((col.serial - 25569) * 86400 * 1000);
                            purchasesToInsert.push({
                                product_id: productId,
                                unit_price: price,
                                quantity: 1, 
                                total_cost: price,
                                payment_method: 'cash',
                                raw_data_source: `${fileName} (Efectivo)`,
                                created_at: date.toISOString(),
                                is_pre_digital_entry: true
                            });
                        }
                    });
                });
            }

            // 2. PROCESAR CREDITO/GINGER (LISTAS)
            ['BD CREDITO', 'GINGER'].forEach(tabName => {
                const sheet = workbook.Sheets[tabName];
                if (!sheet) return;
                const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                const headers = raw[0] || [];
                const rows = raw.slice(1);

                const colIdx = {
                    date: headers.indexOf('FECHA'),
                    name: headers.indexOf('PRODUCTO'),
                    price: headers.indexOf('$COSTO/KG'),
                    qty: headers.indexOf('KG'),
                    total: headers.indexOf('TOTAL')
                };

                // Fallback para nombres en minúscula
                if (colIdx.name === -1) colIdx.name = headers.indexOf('Producto');
                if (colIdx.date === -1) colIdx.date = headers.indexOf('Fecha');

                rows.forEach(row => {
                    if (!row || row.length < 3) return;
                    const name = (row[colIdx.name] || '').toString().trim().toUpperCase();
                    const mappedId = idMap.get(name);
                    const productId = uuidMap.get(mappedId);
                    
                    const price = parseFloat(row[colIdx.price] || row[headers.indexOf('PRECIO')] || 0);
                    const qty = parseFloat(row[colIdx.qty] || 1);

                    if (productId && !isNaN(price) && price > 0) {
                        const dateSerial = row[colIdx.date];
                        const date = dateSerial ? new Date((dateSerial - 25569) * 86400 * 1000) : new Date();

                        purchasesToInsert.push({
                            product_id: productId,
                            unit_price: price,
                            quantity: isNaN(qty) ? 1 : qty,
                            total_cost: parseFloat(row[colIdx.total] || (price * (isNaN(qty) ? 1 : qty))),
                            payment_method: 'credit',
                            raw_data_source: `${fileName} (${tabName})`,
                            created_at: date.toISOString(),
                            is_pre_digital_entry: true
                        });
                    }
                });
            });

            if (purchasesToInsert.length > 0) {
                console.log(`📑 ${fileName}: Preparados ${purchasesToInsert.length} registros.`);
                for (let i = 0; i < purchasesToInsert.length; i += 500) {
                    const chunk = purchasesToInsert.slice(i, i + 500);
                    const { error } = await supabase.from('purchases').insert(chunk);
                    if (error) console.error(`❌ Error en ${fileName}:`, error.message);
                    else totalInserted += chunk.length;
                }
            }
        }

        console.log(`\n🎉 INGESTA EXITOSA: ${totalInserted} registros cargados.`);

    } catch (err) {
        console.error('💥 Error Fatal:', err);
    }
}

runIngestion();
