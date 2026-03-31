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

  if (data.length > 0) {
      console.log('Detected columns in Excel:', Object.keys(data[0]));
  }

  const processedData = data.map(record => {
    // 1. ID
    const id = record['ID'];
    
    // 2. ID_Padre
    const rawParentId = record['PRODUCTOS QUE SE UNEN PARA INVENTARIO'];
    const parentId = (typeof rawParentId === 'number' && !isNaN(rawParentId)) ? rawParentId : null;

    // 3. Activo
    const rawActivo = record['ACTIVO'];
    let status = 'Inactivo';
    if (rawActivo === true || rawActivo === 1 || rawActivo === 'VERDADERO' || (typeof rawActivo === 'string' && (rawActivo.toLowerCase() === 'activo' || rawActivo.toLowerCase() === 'true'))) {
        status = 'Activo';
    }

    // 4. IVA
    const rawIva = record['IVA'] || record['iva'];
    let iva = 0;
    if (rawIva === 5 || rawIva === 19 || rawIva === '5' || rawIva === '19') {
        iva = parseInt(rawIva);
    }

    return { id, parentId, status, iva };
  });

  // Write CSV
  const header = 'ID,ID_Padre,Activo,IVA';
  const csvLines = [header];
  
  processedData.forEach(p => {
      // If ID is undefined, we skip or report
      if (p.id !== undefined) {
        const pId = p.parentId === null ? '' : p.parentId;
        csvLines.push(`${p.id},${pId},${p.status},${p.iva}`);
      }
  });

  fs.writeFileSync(outputPath, csvLines.join('\n'));
  console.log(`Successfully generated migration CSV at: ${outputPath}`);
  console.log(`Total rows in output: ${csvLines.length - 1}`);
}

processExcel();
