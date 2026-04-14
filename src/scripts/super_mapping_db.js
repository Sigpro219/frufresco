const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');

const supabase = createClient('https://csqurhdykbalvlnpowcz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E');
const excelPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos\\Mapeo_Filtro_Credito_Ginger.xlsx';

async function updateMapping() {
    try {
        console.log('🔄 Iniciando Súper-Mapeo con la Base de Datos...');
        
        // 1. Fetch products from DB
        const { data: dbProducts, error } = await supabase.from('products').select('id, name, accounting_id, sku');
        if (error) throw error;
        
        // 2. Read current Excel
        const workbook = XLSX.readFile(excelPath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);

        let matchCount = 0;

        // 3. Match Logic
        const updatedData = data.map(row => {
            const excelName = (row['Nombre en Excel (Crédito/Ginger)'] || '').toString().trim().toUpperCase();
            const currentId = row['ID Final / SKU (App)'];

            if (!currentId) {
                // Try exact match in DB
                const match = dbProducts.find(p => (p.name || '').toUpperCase().trim() === excelName);
                if (match) {
                    row['ID Final / SKU (App)'] = match.accounting_id || match.sku || match.id;
                    row['Observaciones'] = '✅ Encontrado en DB por nombre exacto';
                    matchCount++;
                } else {
                    // Try partial match (Start of name)
                    const partialMatch = dbProducts.find(p => (p.name || '').toUpperCase().includes(excelName) || excelName.includes((p.name || '').toUpperCase()));
                    if (partialMatch) {
                        row['ID Final / SKU (App)'] = partialMatch.accounting_id || partialMatch.sku || partialMatch.id;
                        row['Observaciones'] = '❓ Sugerido por coincidencia parcial';
                        matchCount++;
                    }
                }
            }
            return row;
        });

        // 4. Save back to Excel
        const newWs = XLSX.utils.json_to_sheet(updatedData);
        workbook.Sheets[workbook.SheetNames[0]] = newWs;
        XLSX.writeFile(workbook, excelPath);

        console.log(`✅ Súper-Mapeo completado. Se encontraron ${matchCount} coincidencias nuevas.`);
        const empty = updatedData.filter(d => !d['ID Final / SKU (App)']);
        console.log(`Quedan ${empty.length} productos sin ID.`);

    } catch (err) {
        console.error('Error:', err.message);
    }
}

updateMapping();
