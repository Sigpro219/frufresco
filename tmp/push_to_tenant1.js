
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const TENANT_1_URL = 'https://csqurhdykbalvlnpowcz.supabase.co';
const TENANT_1_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(TENANT_1_URL, TENANT_1_KEY);

async function sync() {
    const value = "Atado,Caja,Saco,Cubeta,Kg,Bulto,Paquete 500 gramos,Paquete 250 gramos,Unidad,Libra,Litro";
    
    console.log('Pushing standard_units to Tenant 1...');
    const { error } = await supabase.from('app_settings').upsert({ 
        key: 'standard_units', 
        value: value 
    }, { onConflict: 'key' });
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success!');
    }
}

sync();
