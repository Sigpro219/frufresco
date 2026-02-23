const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    console.log('--- TEST INSERT LEAD ---');
    const { data, error } = await supabase
        .from('leads')
        .insert([{ 
            contact_name: 'TEST LEAD', 
            company_name: 'TEST COMPANY',
            phone: '000000000',
            status: 'new'
        }])
        .select();

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Insertado con éxito:', data);
        console.log('ID:', data[0].id);
        
        console.log('--- BUSCANDO TODOS LOS LEADS AHORA ---');
        const { data: allLeads } = await supabase.from('leads').select('*');
        console.log('Total leads now:', allLeads.length);
    }
}

testInsert();
