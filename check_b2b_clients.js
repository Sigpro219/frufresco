
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAllProfiles() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('company_name, contact_name, role');

        if (error) {
            console.error('Error fetching clients:', error);
            return;
        }

        console.log(`Found ${data.length} total profiles:`);
        data.forEach(client => {
            console.log(`- ${client.company_name} (${client.contact_name}) [Role: ${client.role}]`);
        });
    } catch (e) {
        console.error('Execution error:', e);
    }
}

checkAllProfiles();
