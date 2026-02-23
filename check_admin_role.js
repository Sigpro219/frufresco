const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const SUPABASE_URL = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1];
const SUPABASE_ANON_KEY = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAdminRole() {
    const userId = 'b80dd828-e83d-4ad8-b3ad-5ddc11613cd9';
    
    console.log('🔍 Verificando rol del usuario:', userId);
    
    const { data, error } = await supabase
        .from('profiles')
        .select('id, role, company_name, contact_name')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('❌ Error:', error);
        return;
    }
    
    console.log('\n📋 Datos del perfil:');
    console.log('  ID:', data.id);
    console.log('  Rol:', data.role);
    console.log('  Tipo de dato del rol:', typeof data.role);
    console.log('  Empresa:', data.company_name);
    console.log('  Contacto:', data.contact_name);
    
    console.log('\n✨ Verificación:');
    console.log('  ¿Es admin?', data.role === 'admin');
    console.log('  ¿Es employee?', data.role === 'employee');
    console.log('  ¿Es b2b_client?', data.role === 'b2b_client');
    
    if (data.role !== 'admin' && data.role !== 'employee') {
        console.log('\n⚠️  PROBLEMA: El rol actual es "' + data.role + '"');
        console.log('   Para ver el dropdown de Operaciones, el rol debe ser "admin" o "employee"');
        console.log('\n🔧 Para corregir, ejecuta:');
        console.log('   UPDATE profiles SET role = \'admin\' WHERE id = \'' + userId + '\';');
    } else {
        console.log('\n✅ El rol está correcto!');
        console.log('   El usuario debería ver el navbar de empleado con el dropdown "Operaciones"');
    }
}

checkAdminRole().then(() => process.exit(0));

