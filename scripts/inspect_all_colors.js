const xlsx = require('xlsx');
const path = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(path, { cellStyles: true });
const ws = wb.Sheets[wb.SheetNames[0]];

const yellowRows = [];
const whiteRows = [];

for (let r = 2; r <= 176; r++) {
  const cellA = ws[`A${r}`];
  const cellB = ws[`B${r}`];
  const cellC = ws[`C${r}`];
  const cellD = ws[`D${r}`];
  
  const isYellow = cellA?.s?.fgColor?.rgb === 'FFFF00' || cellB?.s?.fgColor?.rgb === 'FFFF00' || cellD?.s?.fgColor?.rgb === 'FFFF00';
  const rowData = {
    row: r,
    accId: cellB?.v,
    name: cellC?.v,
    qty: cellD?.v,
    isYellow
  };

  if (isYellow) yellowRows.push(rowData);
  else whiteRows.push(rowData);
}

console.log('Total rows (data):', 175);
console.log('Yellow rows (Subtotals/Resumen):', yellowRows.length);
console.log('White rows (Detalle):', whiteRows.length);

console.log('\nSample yellow rows:', yellowRows.slice(0, 10));
console.log('\nSample white rows:', whiteRows.slice(0, 10));

// Check if any yellow row has a white detailed row above it
let totalYellowQty = 0;
yellowRows.forEach(r => totalYellowQty += (parseFloat(r.qty) || 0));
console.log('\nTotal sum of Yellow rows:', totalYellowQty.toFixed(2));

let totalWhiteQty = 0;
whiteRows.forEach(r => totalWhiteQty += (parseFloat(r.qty) || 0));
console.log('Total sum of White rows:', totalWhiteQty.toFixed(2));
