const xlsx = require('xlsx');

try {
  const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\DATA PRODUCTOS A 20 DE FEBRERO DE 2026 (1) (2).xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  
  for (let i = 0; i < Math.min(20, data.length); i++) {
    console.log(`Row ${i + 1}:`, data[i]);
  }

} catch (error) {
  console.error('Error:', error.message);
}
