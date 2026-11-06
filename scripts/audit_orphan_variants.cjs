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

async function auditVariants() {
  const { data: allProds } = await supabase
    .from('products')
    .select('id, sku, accounting_id, name, parent_id, is_active')
    .eq('is_active', true);

  console.log(`Total active products: ${allProds.length}`);

  // Check if there are other products with keywords like 'institucional', 'sin hoja', 'picado', 'desgranado' that might be missing parent_id
  const suspiciousKeywords = ['institucional', 'en tallo', 'sin hoja', 'desgranad', 'picad', 'pelad'];
  
  const orphans = [];
  allProds.forEach(p => {
    const lower = p.name.toLowerCase();
    const hasKeyword = suspiciousKeywords.some(kw => lower.includes(kw));
    if (hasKeyword && !p.parent_id) {
      orphans.push(p);
    }
  });

  console.log(`\nPotential orphan variants without parent_id (total: ${orphans.length}):`);
  orphans.forEach(o => {
    console.log(`- [${o.accounting_id}] ${o.name} (SKU: ${o.sku})`);
  });
}

auditVariants().catch(console.error);
