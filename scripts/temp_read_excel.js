const XLSX = require('xlsx');

const filePath = process.argv[2];

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log('--- ANÁLISIS DE DATOS ---');
    console.log(`Total registros: ${data.length}`);
    
    const uniqueInventario = [...new Set(data.map(d => d['GRUPO INVENTARIO']))];
    const uniqueSublista = [...new Set(data.map(d => d['SUBLISTA DE COMPRA']))];
    const uniqueComprador = [...new Set(data.map(d => d['Comprador']))];
    const uniqueProcurement = [...new Set(data.map(d => d['__EMPTY']))];

    console.log('\nGrupos de Inventario únicos:', uniqueInventario);
    console.log('\nSublistas de Compra únicas:', uniqueSublista);
    console.log('\nCompradores únicos:', uniqueComprador);
    console.log('\nMétodos de Compra (__EMPTY) únicos:', uniqueProcurement);

    console.log('\n--- MUESTRA DE PRODUCTOS ACTIVOS (PRIMEROS 10) ---');
    const activos = data.filter(d => d['ACTIVO'] === 'SI').slice(0, 10);
    console.log(JSON.stringify(activos, null, 2));

} catch (error) {
    console.error('Error:', error.message);
}
