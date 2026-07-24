const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(supabaseUrl, serviceKey);

async function inspectColumns() {
    const { data, error } = await supabase.from('providers').select('*').limit(1);
    if (error) {
        console.error('Error fetching sample provider:', error);
    } else if (data && data.length > 0) {
        console.log('Providers DB Columns:', Object.keys(data[0]));
        console.log('Sample Provider Object:', data[0]);
    } else {
        console.log('No provider found in table');
    }
}

inspectColumns();
