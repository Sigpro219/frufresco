const fs = require('fs');
const xlsx = require('xlsx');

const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales/WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
const headers = rows[0];

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

console.log('=== CHECKING ALL 931 ROWS FOR ANY SURPRISES ===');
const populatedColsAcrossAll = new Set();
const uomValues = new Set();
const bodegaValues = new Set();
const clasificacionValues = new Set();
const ivaValues = new Set();
const tipoDocValues = new Set();
const formaPagoValues = new Set();

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row) continue;
  for (let i = 0; i < headers.length; i++) {
    const val = row[i];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      populatedColsAcrossAll.add(i);
    }
  }
  if (row[30] !== undefined && row[30] !== null) clasificacionValues.add(String(row[30]));
  if (row[32] !== undefined && row[32] !== null) bodegaValues.add(String(row[32]));
  if (row[33] !== undefined && row[33] !== null) uomValues.add(String(row[33]));
  if (row[35] !== undefined && row[35] !== null) ivaValues.add(row[35]);
  if (row[1] !== undefined && row[1] !== null) tipoDocValues.add(String(row[1]));
  if (row[8] !== undefined && row[8] !== null) formaPagoValues.add(String(row[8]));
}

console.log('Populated columns across ALL 931 rows:');
headers.forEach((h, i) => {
  const colLetter = getExcelColumnName(i);
  const isPopulated = populatedColsAcrossAll.has(i);
  console.log(`${colLetter} (${i}) [${h}]: ${isPopulated ? 'POPULATED' : 'STRICTLY EMPTY'}`);
});

console.log('\nDistinct values in Col AE [Encab: Clasificación]:', Array.from(clasificacionValues));
console.log('Distinct values in Col AG [Detalle: Bodega]:', Array.from(bodegaValues));
console.log('Distinct values in Col AH [Detalle: UnidadDeMedida]:', Array.from(uomValues));
console.log('Distinct values in Col AJ [Detalle: IVA]:', Array.from(ivaValues));
console.log('Distinct values in Col B [Encab: Tipo Documento]:', Array.from(tipoDocValues));
console.log('Distinct values in Col I [Encab: FormaPago]:', Array.from(formaPagoValues));
