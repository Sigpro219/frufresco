
// Script rápido para verificar clientes
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.log('Faltan variables de entorno SUPABASE_URL o SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkClients() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, company_name, role, nit')
        .eq('role', 'client')
        .limit(10);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Clientes encontrados:', data.length);
        console.table(data);
    }
}

checkClients();
