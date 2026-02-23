const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
    console.log('--- BUSCANDO TABLAS ---');
    // Using a simple query to a table we know should exist
    const { data: leads, error: errorLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });
    
    console.log('Tabla leads:', errorLeads ? 'Error' : 'Existe', 'Contras:', leads ? 'OK' : 'NULL');

    const { data: app_settings, error: errorSettings } = await supabase
        .from('app_settings')
        .select('key, value');
    
    console.log('Tabla app_settings:', errorSettings ? 'Error' : 'Existe');
    if (app_settings) {
        console.log('Geofence key exists?', app_settings.some(s => s.key === 'geofence_b2b_poly'));
    }

    // Try to find if there are ANY records in leads
    const { data: allLeads } = await supabase.from('leads').select('*').limit(1);
    console.log('Ejemplo de lead:', allLeads);
}

checkDatabase();
