
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { console.log('Sin credenciales'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable(table) {
    console.log(`\n🔍 Inspeccionando tabla: ${table}`);
    const { data, error } = await supabase.from(table).select('*').limit(1);

    if (error) {
        console.error(`❌ Error en ${table}:`, error.message);
    } else if (data && data.length > 0) {
        console.log(`✅ Columnas en ${table}:`, Object.keys(data[0]).join(', '));
    } else {
        // Si está vacía, intentamos insertar y fallar para ver columnas, o asumimos que no podemos verlas facilmente sin pg_meta
        // Pero el error "Could not find column X" nos ayuda.
        console.log(`⚠️ Tabla ${table} vacía o sin acceso directo. Intentando describir...`);
    }
}

async function run() {
    await inspectTable('orders');
    await inspectTable('order_items');
}

run();
