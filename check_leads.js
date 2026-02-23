const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLeads() {
    console.log('--- BUSCANDO ÚLTIMOS LEADS ---');
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }

    if (data.length === 0) {
        console.log('No se encontraron leads.');
    } else {
        data.forEach((lead, index) => {
            console.log(`\n[LEAD ${index + 1}] ID: ${lead.id}`);
            console.log(`Nombre: ${lead.contact_name}`);
            console.log(`Email: ${lead.email}`);
            console.log(`Latitud: ${lead.latitude}`);
            console.log(`Longitud: ${lead.longitude}`);
            console.log(`Notas: ${lead.notes}`);
            console.log(`Columnas presentes: ${Object.keys(lead).join(', ')}`);
        });
    }
}

checkLeads();
