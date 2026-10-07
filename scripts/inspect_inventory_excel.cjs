const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\detalle_inventario_2026-10-05.xlsx';

if (!fs.existsSync(filePath)) {
    console.error('El archivo no existe en la ruta:', filePath);
    process.exit(1);
}

const workbook = XLSX.readFile(filePath);
console.log('=== INSPECCIÓN DE EXCEL DE INVENTARIO (05/10/2026) ===');
console.log('Hojas disponibles:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
    console.log(`\n--- Hoja: "${sheetName}" ---`);
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`Total filas en hoja: ${rawRows.length}`);
    
    // Imprimir las primeras 10 filas
    console.log('Primeras filas:');
    rawRows.slice(0, 10).forEach((r, idx) => {
        console.log(`Fila ${idx + 1}:`, JSON.stringify(r));
    });
});
