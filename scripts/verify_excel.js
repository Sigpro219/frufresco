const xlsx = require('xlsx');

try {
  const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\DATA PRODUCTOS A 20 DE FEBRERO DE 2026 (1) (2).xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Summary from columns J and K (index 9 and 10)
  const summary = {};
  for (let i = 1; i < 10; i++) {
    const row = rows[i];
    if (row && row[10]) {
      summary[row[10]] = row[9];
    }
  }

  console.log('--- Summary from Excel (Col J/K) ---');
  console.log(JSON.stringify(summary, null, 2));

  // Analysis
  const dataRows = rows.slice(1);
  let totalSKUs = 0;
  let activeCount = 0;
  let webCount = 0;
  let rowsWithParentId = 0;
  let parentsSet = new Set();
  let childrenList = [];
  let idEqualsParent = 0;

  dataRows.forEach(row => {
    const id = row[0];
    const parentId = row[7];
    
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      rowsWithParentId++;
    }

    if (!id) return;
    totalSKUs++;
    
    if (row[4] === 'SI') activeCount++;
    if (row[5] === 'SI') webCount++;
    
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      if (id == parentId) {
        idEqualsParent++;
        parentsSet.add(parentId);
      } else {
        childrenList.push({ id, parentId });
        parentsSet.add(parentId);
      }
    }
  });

  const allProductIds = new Set(dataRows.map(r => r[0]).filter(id => id));
  let ghostParents = new Set();
  
  childrenList.forEach(c => {
    if (!allProductIds.has(c.parentId)) {
      ghostParents.add(c.parentId);
    }
  });

  console.log('\n--- Discrepancy Investigation ---');
  console.log(`Ghost Parents (referenced but not in Producto list): ${ghostParents.size}`);
  if (ghostParents.size > 0) {
    console.log('Ghost Parents:', Array.from(ghostParents));
  }

  // Find the extra parent compared to summary
  console.log(`Unique Parents found: ${parentsSet.size} (Expected ~70)`);
  
  // What if a parent ID is null/empty but was counted? No, already checked.

  // Let's check for duplicate IDs in the Producto column
  const idCounts = {};
  dataRows.forEach(r => {
    if (r[0]) {
      idCounts[r[0]] = (idCounts[r[0]] || 0) + 1;
    }
  });
  const duplicates = Object.keys(idCounts).filter(id => idCounts[id] > 1);
  console.log(`Duplicate IDs in Producto column: ${duplicates.length}`);

} catch (error) {
  console.error('Error:', error.message);
}
