const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLead() {
    const id = '07184388-04e5-4832-bffb-4a5994a9da77';
    console.log(`--- BUSCANDO LEAD ${id} ---`);
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Resultados:', data.length);
        if (data.length > 0) {
            console.log(JSON.stringify(data[0], null, 2));
        } else {
            console.log('No se encontró nada en este proyecto.');
        }
    }
}

inspectLead();
