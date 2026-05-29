const { createClient } = require('@supabase/supabase-js');
const url = 'https://csqurhdykbalvlnpowcz.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';
const supabase = createClient(url, key);

async function run() {
    const { data: params, error: err1 } = await supabase.from('logistic_parameters').select('*');
    console.log('--- LOGISTIC PARAMETERS ---');
    console.log(err1 || params);

    const { data: stops, error: err2 } = await supabase.from('route_stops').select('id, route_id, order_id, sequence_number, status').limit(10);
    console.log('--- ROUTE STOPS (limit 10) ---');
    console.log(err2 || stops);
}
run();
