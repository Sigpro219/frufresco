const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\PROVEEDORES finales.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log('First 10 rows:');
    data.slice(0, 10).forEach((row, i) => console.log(`Row ${i}:`, row));
} catch (error) {
    console.error('Error reading excel:', error.message);
}
