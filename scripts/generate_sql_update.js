const xlsx = require('xlsx');
const fs = require('fs');

const EXCEL_PATH = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\full_maestro_2026-03-19.xlsx";

try {
    const workbook = xlsx.readFile(EXCEL_PATH);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    
    let values = [];
    data.forEach(item => {
        if (item.ID_INTERNO && item.Categoria) {
            const oldSku = item.SKU || '';
            const suffix = oldSku.includes('-') ? oldSku.split('-').pop() : (item.ID_CONTABLE || '0000');
            const newSku = `${item.Categoria}-${suffix}`;
            values.push(`('${item.ID_INTERNO}', '${item.Categoria}', '${newSku}')`);
        }
    });

    const sql = `-- RECONCILIACION MAESTRA - FRUFRESCO TENANT 1
-- Ejecutar en el Editor SQL de Supabase

BEGIN;

UPDATE products AS p 
SET 
    category = v.new_cat,
    sku = v.new_sku
FROM (VALUES 
${values.join(',\n')}
) AS v(id, new_cat, new_sku)
WHERE p.id = v.id::uuid;

COMMIT;

-- Verificacion post-update
SELECT id, name, category, sku FROM products LIMIT 5;`;

    fs.writeFileSync('Update_FruFresco_Master.sql', sql);
    console.log(`✅ SQL Generado: Update_FruFresco_Master.sql con ${values.length} registros.`);

} catch (e) {
    console.error("Error generating SQL:", e.message);
}
