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
            const iva = item.IVA || 0;
            
            // Escapamos con comillas simples si hay que limpiar algo, pero ID y IVA son seguros
            values.push(`('${item.ID_INTERNO}', '${item.Categoria}', '${newSku}', ${iva})`);
        }
    });

    const sql = `-- RECONCILIACION MAESTRA - FRUFRESCO TENANT 1 (Con IVA)
-- Ejecutar en el Editor SQL de Supabase para Tenant 1

BEGIN;

UPDATE products AS p 
SET 
    category = v.new_cat,
    sku = v.new_sku,
    iva_rate = v.iva
FROM (VALUES 
${values.join(',\n')}
) AS v(id, new_cat, new_sku, iva)
WHERE p.id = v.id::uuid;

COMMIT;

-- Verificacion post-update
SELECT id, name, category, sku, iva_rate FROM products LIMIT 5;`;

    fs.writeFileSync('Update_FruFresco_Master.sql', sql);
    console.log(`✅ SQL Generado: Update_FruFresco_Master.sql con ${values.length} registros (incluyendo IVA).`);

} catch (e) {
    console.error("Error generating SQL:", e.message);
}
