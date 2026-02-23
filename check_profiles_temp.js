const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
    const targetId = 'b80dd828-e83d-4ad8-b3ad-5ddc11613cd9';
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
    
    if (error) {
        console.error('Error fetching profile:', error);
        return;
    }
    
    if (!profile) {
        console.log(`No profile found for ID: ${targetId}`);
    } else {
        console.log('--- Profile Found for Target ID ---');
        console.dir(profile);
    }
}

checkProfiles();
