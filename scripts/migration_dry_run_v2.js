const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function dryRunV2() {
  const csvPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\output_migration_v2.csv';
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData.split('\n').filter(l => l.trim().length > 0);
  lines.shift(); // Remove header

  console.log('Fetching existing products from Supabase...');
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sku, accounting_id');
  
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  const accountMap = {};
  products.forEach(p => {
    if (p.accounting_id !== null) {
        accountMap[p.accounting_id] = { id: p.id, name: p.name, sku: p.sku };
    }
  });

  const plannedUpdates = [];
  const statusUpdates = [];
  const ivaUpdates = [];

  lines.forEach(line => {
    // Parse CSV: ID,ID_Padre,Activo,IVA
    const parts = line.split(',');
    if (parts.length < 4) return;
    
    const id = parseInt(parts[0]);
    const parentId = parts[1] ? parseInt(parts[1]) : null;
    const status = parts[2] === 'Activo';
    const iva = parseInt(parts[3]);

    const child = accountMap[id];
    if (!child) return;

    // Resolve parent
    let parentName = '(Solo)';
    let parentUuid = null;
    if (parentId && accountMap[parentId]) {
        parentName = accountMap[parentId].name;
        parentUuid = accountMap[parentId].id;
    }

    plannedUpdates.push({
        childName: child.name,
        childSku: child.sku,
        parentName: parentName,
        parentUuid: parentUuid,
        status: status,
        iva: iva
    });
  });

  console.log('--- RESUMEN DEL SIMULACRO V2 (DRY RUN) ---');
  console.log(`Registros analizados en el nuevo CSV: ${lines.length}`);
  console.log(`Relaciones a crear: ${plannedUpdates.filter(u => u.parentUuid).length}`);
  console.log(`Cambios en IVA: ${plannedUpdates.filter(u => u.iva > 0).length} productos gravados (5% o 19%)`);

  console.log('\n--- PRIMERAS 15 RELACIONES Y ESTADOS A APLICAR ---');
  plannedUpdates.slice(0, 15).forEach((upd, idx) => {
    console.log(`${idx + 1}. [${upd.childSku}] ${upd.childName} | Status: ${upd.status ? 'OK' : 'OFF'} | IVA: ${upd.iva}% | Padre: ${upd.parentName}`);
  });

  console.log('\n--- VERIFICACIÓN DE VÍNCULOS CLAVE (BROCOLI/AGUACATE) ---');
  plannedUpdates.filter(u => u.childName.toLowerCase().includes('brocoli') || u.childName.toLowerCase().includes('aguacate')).slice(0, 10).forEach((upd, idx) => {
    console.log(`${idx + 1}. [${upd.childSku}] ${upd.childName} --> Padre: ${upd.parentName}`);
  });
}

dryRunV2();
