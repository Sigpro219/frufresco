const xlsx = require('xlsx');
const path = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(path, { cellStyles: true });
const ws = wb.Sheets[wb.SheetNames[0]];

// Check cells in rows 85 to 97
for (let r = 85; r <= 97; r++) {
  const cellA = ws[`A${r}`];
  const cellB = ws[`B${r}`];
  const cellC = ws[`C${r}`];
  const cellD = ws[`D${r}`];
  console.log(`Row ${r}: B=${cellB?.v} | C=${cellC?.v} | D=${cellD?.v} | style:`, cellA?.s, cellB?.s);
}
