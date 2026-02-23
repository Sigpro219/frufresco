
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) { console.log('Sin credenciales'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProducts() {
    console.log('🔍 Inspeccionando tabla Products...');

    // Traer un producto para ver todas sus columnas
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);

    if (error) {
        console.error('❌ Error:', error.message);
    } else if (data && data.length > 0) {
        console.log('📦 Columnas encontradas en el primer producto:', Object.keys(data[0]));
        console.log('📄 Ejemplo de datos:', data[0]);
    } else {
        console.log('⚠️ La tabla products está vacía.');
    }
}

checkProducts();
