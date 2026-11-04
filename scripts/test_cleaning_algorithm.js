const xlsx = require('xlsx');
const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/INVENTARIO 2810.xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

// Let's inspect the entire sequence of rows from row 50 to 175
console.log('Total raw rows:', data.length);

// Let's trace how groups are formed
const items = [];
let i = 0;
while (i < data.length) {
  const row = data[i];
  const accId = Number(row['idProducto']);
  const name = String(row['Producto']).trim();
  const qty = parseFloat(row['Inventario bodega']) || 0;

  // Check if this row is followed by an identical row (simple single item duplicate)
  if (i + 1 < data.length && 
      Number(data[i + 1]['idProducto']) === accId && 
      parseFloat(data[i + 1]['Inventario bodega']) === qty &&
      String(data[i + 1]['Producto']).trim() === name) {
    // Single item duplicated (detail + subtotal)
    items.push({ accId, name, qty, sourceRows: [i + 2, i + 3], type: 'single' });
    i += 2;
    continue;
  }

  // Check if this is the start of a multi-item group
  // A multi-item group has different items followed by a row with the same accId as the first item,
  // whose qty equals the sum of the previous items!
  // Let's look ahead:
  let foundGroup = false;
  for (let j = i + 1; j < Math.min(i + 10, data.length); j++) {
    if (Number(data[j]['idProducto']) === accId) {
      // candidate subtotal row
      const candidateSubtotal = parseFloat(data[j]['Inventario bodega']) || 0;
      // sum items from i to j-1
      let sum = 0;
      for (let k = i; k < j; k++) {
        sum += parseFloat(data[k]['Inventario bodega']) || 0;
      }
      if (Math.abs(sum - candidateSubtotal) < 0.01) {
        // MATCH! rows from i to j-1 are detailed items, row j is subtotal!
        foundGroup = true;
        for (let k = i; k < j; k++) {
          items.push({
            accId: Number(data[k]['idProducto']),
            name: String(data[k]['Producto']).trim(),
            qty: parseFloat(data[k]['Inventario bodega']) || 0,
            sourceRows: [k + 2],
            type: 'detail_in_group'
          });
        }
        i = j + 1; // skip subtotal
        break;
      }
    }
  }

  if (foundGroup) continue;

  // If not part of a duplicate or group, it's an un-duplicated single row (like rows 1 to 55)
  items.push({ accId, name, qty, sourceRows: [i + 2], type: 'unique' });
  i++;
}

console.log('Total extracted clean items:', items.length);
let totalCleanQty = 0;
items.forEach(it => totalCleanQty += it.qty);
console.log('Total clean inventory quantity (kg/und):', totalCleanQty.toFixed(2));

// Check if any accId is repeated in clean items
const cleanAccMap = {};
items.forEach(it => {
  cleanAccMap[it.accId] = (cleanAccMap[it.accId] || 0) + 1;
});
const remainingDupes = Object.entries(cleanAccMap).filter(([k, v]) => v > 1);
console.log('Remaining duplicates after cleaning:', remainingDupes);
if (remainingDupes.length > 0) {
  remainingDupes.forEach(([k]) => {
    console.log('Duplicate item:', items.filter(it => it.accId === Number(k)));
  });
}
