const xlsx = require('xlsx');

const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\rutas de prueba.xlsx';

try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    if (data.length > 0) {
        console.log("Columnas:", Object.keys(data[0]));
        console.log("Muestra de los 2 primeros registros:");
        console.log(JSON.stringify(data.slice(0, 2), null, 2));
        console.log("Total de registros:", data.length);
    } else {
        console.log("El archivo está vacío.");
    }
} catch (error) {
    console.error("Error al leer el archivo:", error);
}
