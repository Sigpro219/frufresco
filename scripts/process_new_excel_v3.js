const fs = require('fs');
const XLSX = require('xlsx');

const excelPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\relaciones padre hijo 2.xlsx';
const outputPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\output_migration_v2.csv';

function processExcel() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Use header: 1 to get raw arrays for safety
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log(`Processing ${rawData.length} lines (including headers)...`);

  const processedData = [];
  
  // We'll skip the first row (headers)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // 1. ID: index 0
    const id = row[0];
    if (!id && id !== 0) continue; // Skip empty rows

    // 2. ID_Padre: index 7
    const rawParentId = row[7];
    const parentId = (typeof rawParentId === 'number' && !isNaN(rawParentId)) ? rawParentId : null;

    // 3. Activo: index 4
    const rawActivo = String(row[4] || '').toUpperCase();
    let status = 'Inactivo';
    if (rawActivo === 'SI' || rawActivo === 'VERDADERO' || rawActivo === 'ACTIVO' || rawActivo === 'TRUE') {
        status = 'Activo';
    }

    // 4. IVA: index 6
    const rawIva = row[6];
    let iva = 0;
    if (rawIva === 5 || rawIva === 19 || rawIva === '5' || rawIva === '19') {
        iva = parseInt(rawIva);
    }

    processedData.push({ id, parentId, status, iva });
  }

  // Deduplicate and protect against multiple parents (Rule 5)
  const seenIds = new Set();
  const finalData = [];
  
  processedData.forEach(row => {
      if (!seenIds.has(row.id)) {
          finalData.push(row);
          seenIds.add(row.id);
      }
  });

  // Write CSV
  const header = 'ID,ID_Padre,Activo,IVA';
  const csvLines = [header];
  
  finalData.forEach(p => {
      const pId = p.parentId === null ? '' : p.parentId;
      csvLines.push(`${p.id},${pId},${p.status},${p.iva}`);
  });

  fs.writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`Successfully generated migration CSV at: ${outputPath}`);
  console.log(`Total records processed: ${finalData.length}`);
}

processExcel();
