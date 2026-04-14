const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const directoryPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos';
const files = [
    '10.OCTUBRE 2025-BD COSTOS.xlsx',
    '11.NOVIEMBRE 2025 -BD COSTOS.xlsx',
    '12.DICIEMBRE 2025-BD COSTOS.xlsx',
    '2026-ENERO BD COSTOS.xlsx',
    '2026-FEBRERO BD COSTOS.xlsx',
    '2026-MARZO BD COSTOS.xlsx'
];

const creditProducts = new Set();
const cashProductsWithId = new Map(); // Name -> ID

files.forEach(fileName => {
    const filePath = path.join(directoryPath, fileName);
    if (!fs.existsSync(filePath)) return;

    try {
        const workbook = XLSX.readFile(filePath);
        
        // 1. First, index products that already have an ID in the Cash (Efectivo) tab
        const cashSheet = workbook.Sheets['BD EFECTIVO'];
        if (cashSheet) {
            const data = XLSX.utils.sheet_to_json(cashSheet);
            data.forEach(row => {
                const name = (row['Producto'] || row['PRODUCTO'] || '').toString().trim().toUpperCase();
                const id = row['ID'] || row['Id'];
                if (name && id) {
                    cashProductsWithId.set(name, id);
                }
            });
        }

        // 2. Identify products in Credit/Ginger
        ['BD CREDITO', 'GINGER'].forEach(tabName => {
            const sheet = workbook.Sheets[tabName];
            if (sheet) {
                const data = XLSX.utils.sheet_to_json(sheet);
                data.forEach(row => {
                    const name = (row['PRODUCTO'] || row['Producto'] || '').toString().trim().toUpperCase();
                    if (name) {
                        creditProducts.add(name);
                    }
                });
            }
        });
    } catch (error) {}
});

// 3. Filter: Only products from Credit/Ginger that ARE NOT fully identified in Cash tabs 
// Or just all of them from Credit as requested to "focus efforts".
const exportData = Array.from(creditProducts).sort().map(name => {
    const existingId = cashProductsWithId.get(name) || '';
    return {
        'Nombre en Excel (Crédito/Ginger)': name,
        'ID Sugerido (Encontrado en Efectivo)': existingId,
        'ID Final / SKU (App)': existingId, // Pre-filled if found
        'Origen': 'Crédito/Ginger'
    };
});

const ws = XLSX.utils.json_to_sheet(exportData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Filtro Regularización');

const outputPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos\\Mapeo_Filtro_Credito_Ginger.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✅ Archivo filtrado generado exitosamente en: ${outputPath}`);
console.log(`Total productos a revisar (Crédito/Ginger): ${exportData.length}`);
