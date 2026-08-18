const XLSX = require('xlsx');
const path = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\RESTRICCION DE OFERTA LOGISTICA.xlsx';

try {
    const workbook = XLSX.readFile(path);
    console.log('Sheet Names:', workbook.SheetNames);
    
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n=== SHEET: ${sheetName} ===`);
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`Total rows: ${data.length}`);
        console.log('Headers / First 10 rows:');
        data.slice(0, 15).forEach((row, idx) => {
            console.log(`Row ${idx}:`, JSON.stringify(row));
        });
    });
} catch (err) {
    console.error('Error reading Excel file:', err);
}
