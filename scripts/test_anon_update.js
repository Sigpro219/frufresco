const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const anonClient = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function testAnonUpdate() {
  console.log('Testing anon update on order 1258...');
  const { data, error } = await anonClient
    .from('orders')
    .update({ warehouse_spaces: [ 53 ] })
    .eq('sequence_id', 1258)
    .select('id, sequence_id, warehouse_spaces');

  if (error) {
    console.error('ANON UPDATE ERROR:', error);
  } else {
    console.log('Anon update result:', data);
  }
}

testAnonUpdate();
