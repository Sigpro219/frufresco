const fs = require('fs');
const xlsx = require('xlsx');

const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales/WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
const headers = rows[0];

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

console.log('=== AUDITORIA COMPLETA DE LAS 57 COLUMNAS DEL ARCHIVO ORO ===\n');
for (let c = 0; c < 57; c++) {
  const colLetter = getColLetter(c);
  const header = headers[c];
  
  // Collect non-empty values
  const values = [];
  for (let r = 1; r < rows.length; r++) {
    const val = rows[r][c];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      values.push(val);
    }
  }

  const isPopulated = values.length > 0;
  const uniqueCount = new Set(values).size;
  const sample = values.slice(0, 2);

  console.log(`Col ${colLetter.padEnd(2)} [Idx ${String(c).padStart(2)}] "${header}":`);
  if (!isPopulated) {
    console.log(`       -> VACIO (100% de las 930 filas sin datos)`);
  } else {
    console.log(`       -> POBLADO (${values.length}/930 filas, ${uniqueCount} valores unicos) | Ej: ${JSON.stringify(sample)}`);
  }
}
