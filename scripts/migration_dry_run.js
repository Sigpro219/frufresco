const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function dryRun() {
  const csvData = fs.readFileSync('C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\output_antigravity.csv', 'utf8');
  const lines = csvData.split('\n').filter(l => l.trim().length > 0);
  const header = lines.shift(); // Remove header

  console.log('Fetching existing products from Supabase...');
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sku, accounting_id');
  
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  // Map accounting_id to UUID and Name for fast access
  const accountMap = {};
  products.forEach(p => {
    if (p.accounting_id !== null) {
        accountMap[p.accounting_id] = { id: p.id, name: p.name, sku: p.sku };
    }
  });

  const plannedUpdates = [];
  const statusUpdates = [];

  lines.forEach(line => {
    // Parse CSV: ID,ID_Padre,Estado
    const [idStr, parentIdStr, statusStr] = line.split(',');
    const id = parseInt(idStr);
    const parentId = parentIdStr ? parseInt(parentIdStr) : null;
    const status = statusStr?.trim() === 'Activo';

    const child = accountMap[id];
    if (!child) return;

    if (parentId && accountMap[parentId]) {
        const parent = accountMap[parentId];
        plannedUpdates.push({
            childName: child.name,
            childSku: child.sku,
            parentName: parent.name,
            parentSku: parent.sku,
            parentId: parent.id
        });
    }
    
    // Check status change vs current (optional but for info)
    // Here we just record we'll update it
    statusUpdates.push({
        name: child.name,
        active: status
    });
  });

  console.log('--- RESUMEN DEL SIMULACRO (DRY RUN) ---');
  console.log(`Total de registros en CSV: ${lines.length}`);
  console.log(`Total de niños a vincular a padres: ${plannedUpdates.length}`);
  console.log(`Total de estados de actividad a actualizar: ${statusUpdates.length}`);

  console.log('\n--- PRIMERAS 20 RELACIONES A CREAR ---');
  plannedUpdates.slice(0, 20).forEach((upd, idx) => {
    console.log(`${idx + 1}. HIJO: [${upd.childSku}] ${upd.childName} --> PADRE: [${upd.parentSku}] ${upd.parentName}`);
  });

  const broccoliRels = plannedUpdates.filter(u => u.parentName.toLowerCase().includes('brocoli') || u.childName.toLowerCase().includes('brocoli'));
  if (broccoliRels.length > 0) {
      console.log('\n--- RELACIONES DE BROCOLI ENCONTRADAS ---');
      broccoliRels.slice(0, 10).forEach((upd, idx) => {
          console.log(`${idx + 1}. [${upd.childSku}] ${upd.childName} --> [${upd.parentSku}] ${upd.parentName}`);
      });
  }
}

dryRun();
