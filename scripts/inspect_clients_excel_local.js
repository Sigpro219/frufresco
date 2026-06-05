const xlsx = require('xlsx');

const filePath = "C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD CLIENTES- INVESMENTS CORTES SAS.xlsx";

try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    console.log("SUCCESS: Archivo leído correctamente.");
    console.log("Total de registros:", data.length);
    
    // Contar cuántas sucursales por cada NIT para entender cuáles necesitan Matriz
    const nitCounts = {};
    data.forEach(row => {
        const nit = row.nit;
        if (nit) {
            nitCounts[nit] = (nitCounts[nit] || 0) + 1;
        }
    });

    const multiSucursalNits = Object.entries(nitCounts).filter(([nit, count]) => count > 1);
    console.log(`\nCantidad de NITs únicos: ${Object.keys(nitCounts).length}`);
    console.log(`Cantidad de NITs con múltiples sucursales (requieren Matriz/Padre): ${multiSucursalNits.length}`);
    
    // Muestra de un cliente con múltiples sucursales
    if (multiSucursalNits.length > 0) {
        const sampleNit = multiSucursalNits[0][0];
        const sampleRows = data.filter(row => row.nit == sampleNit);
        console.log(`\nEjemplo de NIT con múltiples sucursales (${sampleNit} - ${sampleRows[0].cliente}):`);
        sampleRows.forEach(row => {
            console.log(`  - Sucursal ID: ${row.idSucursal} | Nombre: ${row.sucursal} | Dir: ${row.direccion}`);
        });
    }

} catch (err) {
    console.error("Error al inspeccionar el archivo:", err.message);
}
