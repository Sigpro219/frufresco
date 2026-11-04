const xlsx = require('xlsx');
const path2410 = 'C:/Users/German Higuera/OneDrive/Desktop/2410 INV INICIAL.xlsx';
const wb = xlsx.readFile(path2410);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

const targetAccIds = [1, 106, 873, 107, 1196, 150, 850, 125, 1259, 127, 778, 1261];
const filtered = data.filter(r => targetAccIds.includes(Number(r['idProducto'])));
filtered.forEach(r => {
  console.log(`idProducto: ${r['idProducto']} | ${r['Producto']} | Qty: ${r['Inventario agregado bodega']}`);
});
