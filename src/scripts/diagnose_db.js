
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Usamos Anon key para simular el cliente

if (!supabaseUrl || !supabaseKey) {
    console.log('Error: Faltan variables de entorno en .env.local (o no se cargaron)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStructure() {
    console.log('Verificando columnas en PROFILES...');

    // Intentamos un insert fake que fallará, pero nos dirá la estructura o un select simple
    // Mejor: Intentamos seleccionar las nuevas columnas de un registro cualquiera

    const { data, error } = await supabase
        .from('profiles')
        .select('id, company_name, nit, address, contact_phone')
        .limit(1);

    if (error) {
        console.error('❌ FALLÓ LA CONSULTA:', error.message);
        if (error.code === '42703') { // Undefined column
            console.error(' DIAGNÓSTICO: Las columnas nuevas (NIT, Address, etc.) NO EXISTEN en la base de datos.');
            console.error(' SOLUCIÓN: Ejecuta el script "update_profiles_schema.sql" en Supabase.');
        }
    } else {
        console.log('✅ Estructura Correcta. Las columnas existen.');
    }
}

checkStructure();
