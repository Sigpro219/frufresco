const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const supabase = createClient('https://csqurhdykbalvlnpowcz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E');
const directoryPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Modelo de costos';
const mappingPath = path.join(directoryPath, 'Mapeo_Filtro_Credito_Ginger.xlsx');

async function debug() {
    const { data: dbProducts } = await supabase.from('products').select('id, accounting_id, sku').limit(5);
    console.log('Ejemplo IDs en DB:', dbProducts);

    const mappingWorkbook = XLSX.readFile(mappingPath);
    const mappingData = XLSX.utils.sheet_to_json(mappingWorkbook.Sheets[mappingWorkbook.SheetNames[0]]);
    console.log('Ejemplo Mapeo Excel (primeras 3 filas):', mappingData.slice(0, 3));

    const file = path.join(directoryPath, '2026-MARZO BD COSTOS.xlsx');
    const wb = XLSX.readFile(file);
    const cashData = XLSX.utils.sheet_to_json(wb.Sheets['BD EFECTIVO']);
    console.log('Ejemplo Fila Efectivo:', cashData[0]);
}

debug();
