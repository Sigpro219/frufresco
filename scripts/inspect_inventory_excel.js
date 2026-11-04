const XLSX = require('xlsx');
const path = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';

try {
  const wb = XLSX.readFile(path);
  console.log('Sheets:', wb.SheetNames);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log('Sheet:', sheetName, 'Rows:', data.length);
    console.log('Sample rows:', data.slice(0, 10));
  }
} catch (err) {
  console.error('Error reading excel:', err);
}
