const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkStatuses() {
    console.log('--- Checking available statuses ---');
    
    const { data: statusStats } = await supabase
        .from('orders')
        .select('status');
    
    if (statusStats) {
        const uniqueStatuses = [...new Set(statusStats.map(s => s.status))];
        console.log('Statuses currently in the database:', uniqueStatuses);
    }

    const { data: sampleOrder } = await supabase.from('orders').select('id, status').limit(1).single();
    if (sampleOrder) {
        console.log(`Current status of ${sampleOrder.id}: ${sampleOrder.status}`);
        console.log(`Testing update to 'approved'...`);
        const { error: testErr } = await supabase.from('orders').update({ status: 'approved' }).eq('id', sampleOrder.id);
        if (testErr) console.error('Update to approved failed:', testErr);
        else console.log('✅ Update to approved succeeded!');

        console.log(`Testing update to 'para_compra'...`);
        const { error: testErr2 } = await supabase.from('orders').update({ status: 'para_compra' }).eq('id', sampleOrder.id);
        if (testErr2) console.error('Update to para_compra failed:', testErr2);
        else console.log('✅ Update to para_compra succeeded!');
    }
}

checkStatuses();
