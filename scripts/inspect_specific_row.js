const XLSX = require('xlsx');
const excelPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\relaciones padre hijo 2.xlsx';
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

for (let i = 0; i < data.length; i++) {
    if (data[i][0] == 1263 || data[i][0] == "1263") {
        console.log('Row for ID 1263:', data[i]);
    }
}
