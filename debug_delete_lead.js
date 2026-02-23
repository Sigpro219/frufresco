const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findAndDelete() {
    console.log('--- BUSCANDO TODOS LOS LEADS ---');
    const { data, error } = await supabase.from('leads').select('*');

    if (error) {
        console.error('Error fetching leads:', error.message);
        return;
    }

    console.log(`Total leads encontrados: ${data.length}`);
    
    const target = data.find(l => 
        (l.company_name && l.company_name.toLowerCase().includes('catira')) ||
        (l.contact_name && l.contact_name.toLowerCase().includes('andres lópez')) ||
        (l.phone && l.phone.includes('310444558'))
    );

    if (!target) {
        console.log('No se encontró el lead "La catira" ni por nombre, contacto o teléfono.');
        // Print all leads to debug
        data.forEach(l => console.log(`- ${l.company_name} | ${l.contact_name} | ${l.phone}`));
        return;
    }

    console.log(`Encontrado: ${JSON.stringify(target, null, 2)}`);
    console.log(`Borrando lead ID: ${target.id}...`);
    
    const { error: deleteError } = await supabase.from('leads').delete().eq('id', target.id);

    if (deleteError) {
        console.error('Error al borrar:', deleteError.message);
    } else {
        console.log('Lead borrado con éxito.');
    }
}

findAndDelete();
