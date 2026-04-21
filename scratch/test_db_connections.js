require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan variables de entorno en .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function testConnections() {
    console.log('--- AUDITORÍA DE CONEXIONES: SUPABASE ("frufresco") ---');
    console.log(`URL: ${supabaseUrl}`);
    console.log('------------------------------------------------------');

    // Test 1: Profiles
    console.log('Prueba 1: Tabla profiles (Lectura pública / anon)...');
    const { data: profiles, error: errProfiles } = await supabase.from('profiles').select('id').limit(1);
    if (errProfiles) console.error('❌ Error en profiles:', errProfiles.message);
    else console.log(`✅ Conexión a profiles exitosa (Se obtuvo 1 registro id: ${profiles[0]?.id || 'N/A'})`);

    // Test 2: Products
    console.log('\nPrueba 2: Tabla products (Lectura pública / anon)...');
    const { data: products, error: errProducts } = await supabase.from('products').select('id, name').limit(1);
    if (errProducts) console.error('❌ Error en products:', errProducts.message);
    else console.log(`✅ Conexión a products exitosa (Producto: ${products[0]?.name || 'N/A'})`);

    // Test 3: Orders (Service Role, as it might be protected)
    console.log('\nPrueba 3: Tabla orders (Lectura Admin / Service Role)...');
    const { data: orders, error: errOrders } = await supabaseAdmin.from('orders').select('id, status').limit(1);
    if (errOrders) console.error('❌ Error en orders:', errOrders.message);
    else console.log(`✅ Conexión a orders exitosa (Order id: ${orders[0]?.id || 'N/A'}, Status: ${orders[0]?.status || 'N/A'})`);

    console.log('\n------------------------------------------------------');
    console.log('✅ Auditoría finalizada.');
}

testConnections();
