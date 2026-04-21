
const XLSX = require('xlsx');
const path = require('path');

const filePath = "C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD COLABORADORES MARZO 2026-INVESTMENTS CORTES SAS.xlsx";

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const datasheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(datasheet);
    
    console.log('--- ENCABEZADOS Y PRIMERA FILA ---');
    console.log(Object.keys(data[0]));
    console.log(data[0]);
    console.log(`\nTotal de colaboradores encontrados: ${data.length}`);
} catch (err) {
    console.error('Error al leer el archivo:', err.message);
}
