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
const productsByTab = {
    'BD CREDITO': new Set(),
    'GINGER': new Set()
};

files.forEach(fileName => {
    const filePath = path.join(directoryPath, fileName);
    if (!fs.existsSync(filePath)) {
        console.log(`Archivo no encontrado: ${fileName}`);
        return;
    }

    try {
        const workbook = XLSX.readFile(filePath);
        ['BD CREDITO', 'GINGER'].forEach(tabName => {
            const sheet = workbook.Sheets[tabName];
            if (sheet) {
                const data = XLSX.utils.sheet_to_json(sheet);
                data.forEach(row => {
                    const productName = row['PRODUCTO'] || row['Producto'];
                    if (productName) {
                        productsByTab[tabName].add(productName.trim());
                        uniqueProducts.add(productName.trim());
                    }
                });
            }
        });
    } catch (error) {
        console.error(`Error procesando ${fileName}:`, error.message);
    }
});

console.log('--- PRODUCTOS ENCONTRADOS EN TABS DE CREDITO ---');
const sortedProducts = Array.from(uniqueProducts).sort();
console.log(JSON.stringify(sortedProducts, null, 2));
console.log(`Total productos únicos: ${sortedProducts.length}`);
