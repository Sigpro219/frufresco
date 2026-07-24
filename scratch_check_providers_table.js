const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(supabaseUrl, serviceKey);

async function checkProviders() {
    const { data, error, count } = await supabase
        .from('providers')
        .select('*', { count: 'exact' });

    if (error) {
        console.error('Error fetching providers:', error);
    } else {
        console.log(`Total providers in DB: ${count}`);
        console.log('Sample providers:', data.slice(0, 5).map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            is_active: p.is_active,
            is_archived: p.is_archived
        })));
    }
}

checkProviders();
