const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos\\2026-MARZO BD COSTOS.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    console.log('Pestañas encontradas:', sheetNames);

    sheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`\n--- Pestaña: ${name} ---`);
        if (data.length > 0) {
            console.log('Columnas:', data[0]);
            console.log('Ejemplo fila 1:', data[1]);
        }
    });

} catch (error) {
    console.error('Error leyendo el archivo:', error.message);
}
