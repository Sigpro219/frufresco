const xlsx = require('xlsx');
const path = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(path, { cellStyles: true });
const ws = wb.Sheets[wb.SheetNames[0]];

const whiteItems = [];
const seenAccIds = {};

for (let r = 2; r <= 176; r++) {
  const cellA = ws[`A${r}`];
  const cellB = ws[`B${r}`];
  const cellC = ws[`C${r}`];
  const cellD = ws[`D${r}`];
  
  const isYellow = cellA?.s?.fgColor?.rgb === 'FFFF00' || cellB?.s?.fgColor?.rgb === 'FFFF00' || cellD?.s?.fgColor?.rgb === 'FFFF00';
  if (!isYellow) {
    const accId = Number(cellB?.v);
    const name = String(cellC?.v || '').trim();
    const qty = parseFloat(cellD?.v) || 0;
    whiteItems.push({ row: r, accId, name, qty });
    seenAccIds[accId] = (seenAccIds[accId] || 0) + 1;
  }
}

console.log('Total white items:', whiteItems.length);
let totalWhite = 0;
whiteItems.forEach(it => totalWhite += it.qty);
console.log('Total white inventory (kg/und):', totalWhite.toFixed(2));

const dupes = Object.entries(seenAccIds).filter(([k, v]) => v > 1);
console.log('Duplicate accIds among white items:', dupes.length);
if (dupes.length > 0) {
  console.log('Duplicates:', dupes);
}
