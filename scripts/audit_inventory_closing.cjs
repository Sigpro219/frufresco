const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/detalle_inventario_2026-10-05.xlsx';
const wb = xlsx.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log('--- AUDITORIA DETALLE INVENTARIO 2026-10-05 ---');
console.log('Total filas en Excel:', data.length);

const counts = {};
const validRows = [];
for (let i = 3; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[1]) continue;
  const id = row[1];
  if (!counts[id]) counts[id] = [];
  counts[id].push({ rowIdx: i + 1, list: row[2], name: row[3], stockBodega: parseFloat(row[20]) || 0, row });
  validRows.push({
    id,
    list: row[2],
    name: row[3],
    invInicial: parseFloat(row[4]) || 0,
    correccion: parseFloat(row[5]) || 0,
    compra: parseFloat(row[6]) || 0,
    ventaKg: parseFloat(row[7]) || 0,
    ventaUn: parseFloat(row[8]) || 0,
    pesoVentaUn: parseFloat(row[9]) || 0,
    escaso: parseFloat(row[10]) || 0,
    sinEnviar: parseFloat(row[11]) || 0,
    sinAlistar: parseFloat(row[12]) || 0,
    adicional: parseFloat(row[13]) || 0,
    devoluciones: parseFloat(row[14]) || 0,
    pesada: parseFloat(row[15]) || 0,
    desperdicio: parseFloat(row[16]) || 0,
    basura: parseFloat(row[17]) || 0,
    calculado: parseFloat(row[18]) || 0,
    agregadoBodega: parseFloat(row[19]) || 0,
    bodega: parseFloat(row[20]) || 0,
    faltantes: parseFloat(row[21]) || 0,
    sobrantes: parseFloat(row[22]) || 0,
  });
}

console.log('Total filas con idProducto:', validRows.length);
const uniqueIds = Object.keys(counts);
console.log('Total IDs unicos:', uniqueIds.length);

const duplicates = Object.entries(counts).filter(([id, arr]) => arr.length > 1);
console.log('Total IDs duplicados:', duplicates.length);

let sameBodegaCount = 0;
let diffBodegaList = [];

duplicates.forEach(([id, arr]) => {
  const vals = arr.map(a => a.stockBodega);
  const allSame = vals.every(v => v === vals[0]);
  if (allSame) {
    sameBodegaCount++;
  } else {
    diffBodegaList.push({ id, name: arr[0].name, occurrences: arr });
  }
});

console.log('Duplicados con MISMO stock en Bodega:', sameBodegaCount);
console.log('Duplicados con DIFERENTE stock en Bodega:', diffBodegaList.length);

if (diffBodegaList.length > 0) {
  console.log('\n--- SKUS CON DISCREPANCIA DE STOCK EN FILAS DUPLICADAS ---');
  diffBodegaList.forEach(d => {
    console.log(`\nID: ${d.id} | ${d.name}`);
    d.occurrences.forEach(o => {
      console.log(`  Fila Excel ${o.rowIdx} [${o.list}]: Bodega=${o.stockBodega} | Inicial=${o.row[4]} | Compras=${o.row[6]} | Ventas=${o.row[7]} | Faltante=${o.row[21]} | Sobrante=${o.row[22]}`);
    });
  });
}

