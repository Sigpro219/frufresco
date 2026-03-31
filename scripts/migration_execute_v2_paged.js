const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function executeMigrationV2Paged() {
  const csvPath = 'C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\output_migration_v2.csv';
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData.split('\n').filter(l => l.trim().length > 0);
  lines.shift(); // Remove header

  console.log('Fetching ALL existing products from Supabase (Paged)...');
  let products = [];
  let from = 0;
  const step = 1000;
  
  while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, accounting_id')
        .range(from, from + step - 1);
      
      if (error) {
          console.error(error);
          break;
      }
      
      products = products.concat(data);
      if (data.length < step) break;
      from += step;
  }
  
  console.log(`Retrieved ${products.length} products from Supabase.`);

  const accountMap = {};
  products.forEach(p => {
    if (p.accounting_id !== null) {
        accountMap[p.accounting_id] = { id: p.id, name: p.name, sku: p.sku };
    }
  });

  console.log(`Starting migration for ${lines.length} lines...`);
  
  let updatedCount = 0;
  let errorCount = 0;
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (line) => {
      const parts = line.split(',');
      if (parts.length < 4) return;
      
      const id = parseInt(parts[0]);
      const parentId = parts[1] && parts[1].trim() !== '' ? parseInt(parts[1]) : null;
      const status = parts[2] === 'Activo';
      const iva = parseInt(parts[3]);

      const child = accountMap[id];
      if (!child) return;

      const updateData = { 
          is_active: status,
          iva_rate: iva
      };
      
      if (parentId && accountMap[parentId]) {
          updateData.parent_id = accountMap[parentId].id;
      } else {
          updateData.parent_id = null;
      }

      const { error: updError } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', child.id);

      if (updError) {
          errorCount++;
      } else {
          updatedCount++;
      }
    }));
    
    if (updatedCount > 0) console.log(`Processed ${updatedCount} products...`);
  }

  console.log('\n--- FINAL MIGRATION SUMMARY (TOTAL) ---');
  console.log(`Productos actualizados exitosamente: ${updatedCount}`);
  console.log(`Errores: ${errorCount}`);
}

executeMigrationV2Paged();
