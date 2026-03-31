const XLSX = require('xlsx');
const excelPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\relaciones padre hijo 2.xlsx';
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];

const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const colIdxPadre = 7;

for (let i = 1; i < rawData.length; i++) {
    const pId = rawData[i][colIdxPadre];
    if (pId != null && pId !== '') {
        console.log(`Found data row at index ${i}: ID=${rawData[i][0]}, ParentID=${pId}`);
        console.log('Full Row:', rawData[i]);
        break;
    }
}
