const xlsx = require('xlsx');
const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

const groups = {};
data.forEach((r, idx) => {
  const accId = r['idProducto'];
  if (!groups[accId]) groups[accId] = [];
  groups[accId].push({ row: idx + 2, ...r });
});

const dupes = Object.entries(groups).filter(([k, arr]) => arr.length > 1);
console.log('Total duplicated groups:', dupes.length);
dupes.forEach(([accId, arr]) => {
  const allSameQty = arr.every(x => x['Inventario bodega'] === arr[0]['Inventario bodega']);
  console.log(`idProducto: ${accId}, count: ${arr.length}, sameQty: ${allSameQty}`);
  arr.forEach(r => console.log(`  Row ${r.row}: ${r['Fecha inventario']} | ${r['Producto']} | Bodega: ${r['Inventario bodega']}`));
});
