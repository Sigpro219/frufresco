const xlsx = require('xlsx');
const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws, { header: 1 });
for (let i = 0; i < Math.min(65, data.length); i++) {
  console.log(`Row ${i + 1}:`, JSON.stringify(data[i]));
}
