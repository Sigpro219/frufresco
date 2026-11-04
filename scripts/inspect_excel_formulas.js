const xlsx = require('xlsx');
const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(filePath, { cellStyles: true, cellFormula: true });
const ws = wb.Sheets[wb.SheetNames[0]];

console.log('Sheet !ref:', ws['!ref']);
// Check sample cells around row 90-95
for (let r = 89; r <= 95; r++) {
  const cellA = ws[`A${r}`];
  const cellB = ws[`B${r}`];
  const cellC = ws[`C${r}`];
  const cellD = ws[`D${r}`];
  console.log(`Row ${r}:`, cellB?.v, '|', cellC?.v, '|', cellD?.v, '| formula:', cellD?.f);
}
