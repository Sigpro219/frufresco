const xlsx = require('xlsx');
const path2410 = 'C:/Users/German Higuera/OneDrive/Desktop/2410 INV INICIAL.xlsx';
const path2810 = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';

const wb24 = xlsx.readFile(path2410);
const ws24 = wb24.Sheets[wb24.SheetNames[0]];
const data24 = xlsx.utils.sheet_to_json(ws24, { header: 1 });

console.log('2410 INV INICIAL Sheet Name:', wb24.SheetNames);
console.log('2410 Rows:', data24.length);
console.log('2410 Header:', data24[0]);
console.log('2410 First 5 data rows:', data24.slice(1, 6));

// Check duplicates in 2410
const data24Json = xlsx.utils.sheet_to_json(ws24);
const map24 = {};
data24Json.forEach((r, idx) => {
  const id = r['idProducto'] || r['id'] || r[Object.keys(r)[1]];
  map24[id] = (map24[id] || 0) + 1;
});
const dupes24 = Object.entries(map24).filter(([k, v]) => v > 1);
console.log('Duplicates in 2410:', dupes24.length);
