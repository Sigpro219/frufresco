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

const uniqueProducts = new Set();

files.forEach(fileName => {
    const filePath = path.join(directoryPath, fileName);
    if (!fs.existsSync(filePath)) return;

    try {
        const workbook = XLSX.readFile(filePath);
        ['BD EFECTIVO', 'BD CREDITO', 'GINGER'].forEach(tabName => {
            const sheet = workbook.Sheets[tabName];
            if (sheet) {
                const data = XLSX.utils.sheet_to_json(sheet);
                data.forEach(row => {
                    const productName = row['PRODUCTO'] || row['Producto'];
                    if (productName) {
                        uniqueProducts.add(productName.trim().toUpperCase());
                    }
                });
            }
        });
    } catch (error) {}
});

const sortedProducts = Array.from(uniqueProducts).sort();
const exportData = sortedProducts.map(name => ({
    'Nombre en Excel (Histórico)': name,
    'ID / SKU (App)': '',
    'Observaciones': ''
}));

const ws = XLSX.utils.json_to_sheet(exportData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Regularización SKUs');

const outputPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos\\Mapeo_Regularizacion_SKUs.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✅ Archivo generado exitosamente en: ${outputPath}`);
console.log(`Total productos para mapear: ${sortedProducts.length}`);
