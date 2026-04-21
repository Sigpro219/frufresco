
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const filePath = "C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\BD COLABORADORES MARZO 2026-INVESTMENTS CORTES SAS.xlsx";

const roleMapping = {
    'LIDER DE CARTERA': 'lider_cartera',
    'AUX DE RUTA': 'aux_ruta',
    'COORDINADOR ADMINISTRATIVO': 'coord_admin',
    'LIDER DE LISTA': 'lider_lista',
    'AUX CONTABLE': 'aux_contable',
    'AUX DE BODEGA': 'aux_bodega',
    'LIDER DE FACTURACION': 'lider_facturacion',
    'SERVICIOS GENERALES': 'servicios_generales',
    'LIDER DE INVENTARIO': 'lider_inventario',
    'CONDUCTOR': 'driver',
    'TESORERO': 'tesorero',
    'ENFERMERO': 'enfermero',
    'AUX ADMINISTRATIVO': 'aux_admin',
    'COMPRADOR': 'comprador',
    'GESTION DE PEDIDOS': 'gestion_pedidos',
    'COORDINADOR DE OPERACIONES': 'coord_ops',
    'SERVICIO AL CLIENTE': 'servicio_cliente',
    'RR-HH': 'rrhh'
};

async function migrate() {
    console.log('--- Iniciando Migracion de Colaboradores ---');
    try {
        const workbook = XLSX.readFile(filePath);
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        const preparedData = data.map(row => {
            const rawRole = (row['CARGO '] || '').trim().toUpperCase();
            const rawSpecialty = (row['DEPARTAMENTO'] || '').trim().toUpperCase().replace('B0ODEGA', 'BODEGA');
            const rawDoc = String(row['CEDULA']).replace(/\./g, '').trim();
            const rawEmail = (row['CORREO '] || '').trim().toLowerCase();
            const rawPhone = String(row['TELEFONO CELULAR '] || '').trim();

            return {
                id: crypto.randomUUID(),
                contact_name: (row['NOMBRE'] || '').trim(),
                document_id: rawDoc,
                email: rawEmail || null,
                phone: rawPhone || null,
                contact_phone: rawPhone || null,
                role: roleMapping[rawRole] || 'aux_bodega',
                specialty: rawSpecialty,
                is_active: (row['ESTADO'] || '').trim().toLowerCase() === 'vigente',
                created_at: new Date().toISOString()
            };
        });

        console.log(`Procesando ${preparedData.length} registros...`);

        // Batch upload to collaborators
        const { data: inserted, error } = await supabase
            .from('collaborators')
            .upsert(preparedData, { onConflict: 'document_id' });

        if (error) throw error;
        
        console.log('✅ Migración completada con éxito.');
    } catch (err) {
        console.error('❌ Error fatal:', err.message);
    }
}

migrate();
