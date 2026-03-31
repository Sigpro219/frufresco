const XLSX = require('xlsx');
const excelPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\relaciones padre hijo 2.xlsx';
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];

// Use { header: 1 } to get the raw first row
const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const headers = rawData[0];
console.log('Headers:', headers.map((h, i) => `${i}: "${h}"`));

const colIdxID = 0; // Assuming Column A
const colIdxPadre = headers.findIndex(h => String(h || '').includes('UNEN PARA INVENTARIO'));
const colIdxActivo = headers.findIndex(h => String(h || '').includes('ACTIVO'));
const colIdxIVA = headers.findIndex(h => String(h || '').includes('IVA'));

console.log('Detected Mappings:', { colIdxID, colIdxPadre, colIdxActivo, colIdxIVA });

const sampleWithData = rawData.find(row => row[colIdxPadre] != null && row[colIdxPadre] !== '');
if (sampleWithData) {
    console.log('Found a row with ParentID data:', sampleWithData);
}
