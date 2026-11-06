const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function fixAcelgaParent() {
  const acelgaParentId = 'dbf01b33-8231-4204-801d-62cdbca3745b';
  const acelgaInstId = 'fd6879fe-44ee-4d9a-911f-92e69381b99a';

  console.log('--- Current status of Acelga institucional ---');
  const { data: before } = await supabase.from('products').select('id, name, parent_id').eq('id', acelgaInstId);
  console.log('Before:', before);

  const { data: updateRes, error: updateErr } = await supabase
    .from('products')
    .update({ parent_id: acelgaParentId })
    .eq('id', acelgaInstId)
    .select('id, name, parent_id');

  if (updateErr) {
    console.error('Error updating parent_id:', updateErr);
  } else {
    console.log('Updated successfully:', updateRes);
  }

  console.log('\n--- Checking all Acelga products after update ---');
  const { data: after } = await supabase
    .from('products')
    .select('id, sku, accounting_id, name, parent_id')
    .ilike('name', '%acelga%');
  console.log(JSON.stringify(after, null, 2));
}

fixAcelgaParent().catch(console.error);
