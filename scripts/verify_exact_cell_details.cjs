const fs = require('fs');
const xlsx = require('xlsx');

const goldPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales/WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx';
const wb = xlsx.readFile(goldPath);
const ws = wb.Sheets[wb.SheetNames[0]];

console.log('=== GOLD WORKBOOK METADATA ===');
console.log('Sheet name:', wb.SheetNames[0]);
console.log('Range !ref:', ws['!ref']);
console.log('Has !cols:', !!ws['!cols'], 'Length:', ws['!cols']?.length);
console.log('Has !rows:', !!ws['!rows']);

function getColLetter(idx) {
  let dividend = idx + 1;
  let name = '';
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
}

console.log('\n=== AUDITING ALL 57 CELLS IN ROW 2 (GOLD) ===');
for (let c = 0; c < 57; c++) {
  const col = getColLetter(c);
  const cell = ws[col + '2'];
  const headerCell = ws[col + '1'];
  if (cell) {
    console.log(`Col ${col.padEnd(2)} [${headerCell ? headerCell.v : ''}]: type='${cell.t}', value=${JSON.stringify(cell.v)}, raw=${JSON.stringify(cell.w)}`);
  } else {
    console.log(`Col ${col.padEnd(2)} [${headerCell ? headerCell.v : ''}]: <EMPTY>`);
  }
}
