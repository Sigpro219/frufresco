const XLSX = require('xlsx');
const path = require('path');

const file = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos\\2026-MARZO BD COSTOS.xlsx';

try {
    const wb = XLSX.readFile(file);
    const sheet = wb.Sheets['BD EFECTIVO'];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log('--- ENCABEZADOS REALES (Fila 0) ---');
    console.log(rawData[0]);
    
    console.log('\n--- DATA REAL (Fila 1 a 5) ---');
    console.log(rawData.slice(1, 6));

    const creditSheet = wb.Sheets['BD CREDITO'];
    const creditData = XLSX.utils.sheet_to_json(creditSheet, { header: 1 });
    console.log('\n--- ENCABEZADOS CREDITO (Fila 0) ---');
    console.log(creditData[0]);

} catch (e) {
    console.error(e.message);
}
