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

async function inspectInstitucionales() {
  const { data: prods } = await supabase
    .from('products')
    .select('id, sku, accounting_id, name, parent_id, is_active')
    .ilike('name', '%institucional%');

  console.log(`Found ${prods?.length} institucional products:`);
  prods?.forEach(p => {
    console.log(`${p.accounting_id} | ${p.name.padEnd(30)} | parent_id: ${p.parent_id}`);
  });
}

inspectInstitucionales().catch(console.error);
