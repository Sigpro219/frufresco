const xlsx = require('xlsx');
const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

console.log('--- ANÁLISIS DE BLOQUES AGRUPADOS ---');
// Let's identify the 48 duplicate groups:
const map = {};
data.forEach((r, idx) => {
  const accId = r['idProducto'];
  if (!map[accId]) map[accId] = [];
  map[accId].push({ row: idx + 2, ...r });
});

Object.entries(map).forEach(([accId, arr]) => {
  if (arr.length > 1) {
    const first = arr[0];
    const last = arr[arr.length - 1];
    if (first['Inventario bodega'] !== last['Inventario bodega']) {
      console.log(`\nGrupo idProducto ${accId} (${first['Producto']}):`);
      // check rows between first.row and last.row
      for (let r = first.row; r <= last.row; r++) {
        const item = data[r - 2];
        console.log(`  Fila ${r}: idProducto: ${item['idProducto']} | ${item['Producto']} | Bodega: ${item['Inventario bodega']}`);
      }
    }
  }
});
