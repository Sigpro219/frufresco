const xlsx = require('xlsx');

try {
  const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\DATA PRODUCTOS A 20 DE FEBRERO DE 2026 (1) (2).xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  
  let padres = new Set();
  let hijos = 0;
  
  // Row 0 is header
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = row[0]; // Producto
    const parentId = row[7]; // PRODUTCOS QUE SE UNEN PARA INVENTARIO
    
    if (parentId !== undefined && parentId !== null) {
      if (id === parentId) {
        padres.add(id);
      } else {
        hijos++;
        padres.add(parentId);
      }
    }
  }

  console.log(`Padres únicos encontrados: ${padres.size}`);
  console.log(`Hijos encontrados: ${hijos}`);

} catch (error) {
  console.error('Error:', error.message);
}
