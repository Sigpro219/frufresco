const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteLead() {
    console.log('--- BUSCANDO LEAD "La catira" ---');
    const { data, error: searchError } = await supabase
        .from('leads')
        .select('*')
        .ilike('name', '%La catira%');

    if (searchError) {
        console.error('Error al buscar:', searchError.message);
        return;
    }

    if (data.length === 0) {
        console.log('No se encontró ningún lead con el nombre "La catira".');
        return;
    }

    console.log('Leads encontrados:', data.length);
    for (const lead of data) {
        console.log(`Borrando lead: ${lead.name} (ID: ${lead.id})`);
        const { error: deleteError } = await supabase
            .from('leads')
            .delete()
            .eq('id', lead.id);

        if (deleteError) {
            console.error(`Error al borrar ${lead.name}:`, deleteError.message);
        } else {
            console.log(`Lead ${lead.name} borrado con éxito.`);
        }
    }
}

deleteLead();
