const fs = require('fs');
const XLSX = require('xlsx');

const excelPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\relaciones padre hijo 2.xlsx';
const outputPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\output_migration_v2.csv';

function processExcel() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log(`Processing ${data.length} records...`);

  const processedData = data.map(record => {
    // 1. ID: From 'ID' column
    const id = record['ID'];
    
    // 2. ID_Padre: From 'PRODUCTOS QUE SE UNEN PARA INVENTARIO'
    const rawParentId = record['PRODUCTOS QUE SE UNEN PARA INVENTARIO'];
    const parentId = (typeof rawParentId === 'number' && !isNaN(rawParentId)) ? rawParentId : null;

    // 3. Activo: From 'ACTIVO' column
    // Excel might store it as boolean or string. We normalize.
    const rawActivo = record['ACTIVO'];
    let status = 'Inactivo';
    if (rawActivo === true || rawActivo === 'VERDADERO' || String(rawActivo).toLowerCase() === 'activo' || String(rawActivo).toLowerCase() === 'true') {
        status = 'Activo';
    }

    // 4. IVA: From 'IVA' column
    const rawIva = record['IVA'];
    let iva = 0;
    if (rawIva === 5 || rawIva === 19) {
        iva = rawIva;
    }

    return { id, parentId, status, iva };
  });

  // Write CSV
  const header = 'ID,ID_Padre,Activo,IVA';
  const csvLines = [header];
  
  processedData.forEach(p => {
      const pId = p.parentId === null ? '' : p.parentId;
      csvLines.push(`${p.id},${pId},${p.status},${p.iva}`);
  });

  fs.writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`Successfully generated migration CSV at: ${outputPath}`);
}

processExcel();
