const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://csqurhdykbalvlnpowcz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E');

async function applySchema() {
    console.log('🏗️ Aplicando cambios de esquema...');
    
    // Como RPC exec_sql no existe, intentaremos usar los comandos REST si es posible, 
    // pero para DDL lo mejor es que el usuario lo corra. 
    // Sin embargo, voy a intentar verificar si las columnas ya existen.
    
    const { data, error } = await supabase.from('purchases').select('payment_method').limit(1);
    
    if (error && error.code === 'PGRST204') {
        console.log('❌ El esquema no está listo. Por favor ejecuta el archivo src/lib/Update_Purchases_Finance.sql en el SQL Editor de Supabase.');
        process.exit(1);
    } else {
        console.log('✅ Esquema verificado o columnas ya presentes.');
    }
}

applySchema();
