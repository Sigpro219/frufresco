const fs = require('fs');
const xlsx = require('xlsx');

const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales/WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx';

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const wb = xlsx.readFile(filePath);
console.log('Sheet names:', wb.SheetNames);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
console.log('Total rows:', rows.length);
console.log('Header row length:', rows[0] ? rows[0].length : 0);

function getExcelColumnName(colIndex) {
  let dividend = colIndex + 1;
  let columnName = '';
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
}

const headers = rows[0] || [];
console.log('\n=== HEADERS (Row 1) ===');
headers.forEach((h, i) => {
  const colLetter = getExcelColumnName(i);
  console.log(`${colLetter} (${i}): "${h}"`);
});

console.log('\n=== ANALYZING NON-EMPTY COLUMNS IN ROWS 1..10 ===');
const colStats = {};
for (let i = 0; i < headers.length; i++) {
  colStats[i] = {
    col: getExcelColumnName(i),
    header: headers[i],
    samples: new Set(),
    types: new Set(),
    nonEmptyCount: 0
  };
}

for (let r = 1; r < Math.min(rows.length, 50); r++) {
  const row = rows[r];
  if (!row) continue;
  for (let i = 0; i < headers.length; i++) {
    const val = row[i];
    if (val !== undefined && val !== null && val !== '') {
      colStats[i].nonEmptyCount++;
      colStats[i].types.add(typeof val);
      if (colStats[i].samples.size < 5) {
        colStats[i].samples.add(val);
      }
    }
  }
}

console.log('\n=== POPULATED COLUMNS SUMMARY (from first 50 rows) ===');
for (let i = 0; i < headers.length; i++) {
  const stat = colStats[i];
  if (stat.nonEmptyCount > 0) {
    console.log(`${stat.col} [${stat.header}]:`);
    console.log(`   Count: ${stat.nonEmptyCount}/50 | Types: ${Array.from(stat.types).join(', ')}`);
    console.log(`   Samples: ${JSON.stringify(Array.from(stat.samples).slice(0, 3))}`);
  } else {
    console.log(`${stat.col} [${stat.header}]: (EMPTY)`);
  }
}
