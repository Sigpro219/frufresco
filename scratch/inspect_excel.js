const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD PRODUCTOS 8 DE MAYO-INVESTMENTS CORTES SAS V1.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    workbook.SheetNames.forEach(sn => {
        console.log(`\n--- 📊 Sheet: ${sn} ---`);
        const sheet = workbook.Sheets[sn];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        console.log(`Total Rows: ${data.length}`);
        
        if (data.length > 0) {
            const columns = Object.keys(data[0]);
            columns.forEach(col => {
                const uniqueValues = [...new Set(data.map(r => r[col]))].filter(v => v !== '').slice(0, 10);
                if (uniqueValues.length > 0) {
                    console.log(`  Col [${col}]: ${uniqueValues.join(', ')}`);
                }
            });
        }
    });
} catch (err) {
    console.error("❌ Error reading Excel:", err.message);
}
