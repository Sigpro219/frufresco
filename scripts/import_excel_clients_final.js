require('dotenv').config({ path: '.env.local' });
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = "C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD CLIENTES- INVESMENTS CORTES SAS.xlsx";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Helper helper to clean up cell values
const cleanCell = (val) => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str.toUpperCase() === 'NULL' || str.toUpperCase() === 'UNDEFINED') return null;
    return str;
};

const importClients = async () => {
    try {
        console.log("1. Leyendo Excel...");
        const workbook = xlsx.readFile(filePath);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        console.log(`  ...Encontrados ${data.length} registros en el Excel.`);

        // 2. Extraer NITs únicos para crear los perfiles Padre (Matrices)
        const uniqueNits = new Set();
        data.forEach(row => {
            const cleanNit = cleanCell(row.nit);
            if (cleanNit) uniqueNits.add(cleanNit);
        });
        console.log(`2. Identificados ${uniqueNits.size} NITs únicos para creación de matrices.`);

        // Mapeo local para guardar los IDs generados para cada Matriz (key: nit, value: parent_profile_id)
        const parentMap = {};

        console.log("3. Insertando perfiles Padre (Matrices)...");
        let parentCount = 0;
        for (const nit of uniqueNits) {
            // Buscamos el primer registro con este NIT para usar su nombre base
            const sampleRow = data.find(row => cleanCell(row.nit) === nit);
            const parentName = cleanCell(sampleRow.cliente) || `Matriz NIT ${nit}`;
            const parentId = crypto.randomUUID();

            const parentData = {
                id: parentId,
                role: 'b2b_client',
                company_name: parentName,
                nit: nit,
                is_corporate_parent: true,
                is_active: true,
                document_type: 'invoice', // Por defecto para matrices
                needs_crates: false
            };

            const { error } = await supabase.from('profiles').insert(parentData);
            if (error) {
                console.error(`  ❌ Error insertando Matriz NIT ${nit}:`, error.message);
            } else {
                parentMap[nit] = parentId;
                parentCount++;
            }
        }
        console.log(`✅ ¡Matrices creadas con éxito! Total: ${parentCount}/${uniqueNits.size}`);

        console.log("4. Insertando perfiles Hijo (Sucursales)...");
        let childCount = 0;
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const cleanNit = cleanCell(row.nit);
            const parentId = parentMap[cleanNit];

            if (!parentId) {
                console.warn(`  ⚠️ Omitiendo fila ${i + 2}: No se encontró Matriz vinculada para NIT ${row.nit}`);
                continue;
            }

            const cleanName = cleanCell(row.cliente);
            const cleanSucursal = cleanCell(row.sucursal);
            const childName = cleanSucursal ? `${cleanName} - ${cleanSucursal}` : cleanName;

            const isRemission = cleanCell(row.remision) === 'SI';
            const showPrices = cleanCell(row.precios) === 'SI';
            const statusActive = cleanCell(row.estado) === 'A';

            const childData = {
                id: crypto.randomUUID(),
                role: 'b2b_client',
                parent_id: parentId,
                is_corporate_parent: false,
                company_name: childName,
                contact_name: cleanSucursal || cleanName,
                nit: cleanNit,
                address: cleanCell(row.direccion) || 'Dirección pendiente por asignar',
                phone: cleanCell(row.telefono),
                contact_phone: cleanCell(row.telefono),
                is_active: statusActive,
                needs_crates: false,
                document_type: isRemission ? 'remission' : 'invoice',
                remission_with_prices: showPrices,
                specialty: 'Sede Operativa',
                branch_id: cleanCell(row.idSucursal)
            };

            const { error } = await supabase.from('profiles').insert(childData);
            if (error) {
                console.error(`  ❌ Error insertando Sucursal ${childName}:`, error.message);
            } else {
                childCount++;
            }

            if (childCount % 50 === 0) {
                console.log(`  ...insertadas ${childCount} sucursales.`);
            }
        }
        console.log(`✅ ¡Sucursales creadas con éxito! Total: ${childCount}/${data.length}`);
        
        // Log this massive data population to audits
        await supabase.from('audit_logs').insert([{
            action: 'BULK_IMPORT_CLIENTS',
            module: 'HR_ADMIN',
            details: { parents_created: parentCount, children_created: childCount }
        }]);

        console.log("\n🚀 PROCESO COMPLETADO SATISFACTORIAMENTE");

    } catch (err) {
        console.error("❌ Error durante el proceso de importación:", err.message);
    }
};

importClients();
