
const XLSX = require('xlsx');
const path = require('path');

const filePath = "C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD COLABORADORES MARZO 2026-INVESTMENTS CORTES SAS.xlsx";

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const datasheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(datasheet);
    
    const uniqueRoles = [...new Set(data.map(item => item['CARGO ']?.trim().toUpperCase()))];
    const uniqueDepts = [...new Set(data.map(item => item['DEPARTAMENTO']?.trim().toUpperCase()))];
    
    console.log('--- ROLES UNICOS ---');
    console.log(uniqueRoles);
    console.log('\n--- DEPARTAMENTOS UNICOS ---');
    console.log(uniqueDepts);
} catch (err) {
    console.error('Error:', err.message);
}
