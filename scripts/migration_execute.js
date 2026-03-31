const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function executeMigration() {
  const csvData = fs.readFileSync('C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\output_antigravity.csv', 'utf8');
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

  console.log(`Starting migration for ${lines.length} lines...`);
  
  let updatedCount = 0;
  let errorCount = 0;
  
  // Parallel execution with chunking for performance/reliability
  const BATCH_SIZE = 50;
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (line) => {
      const [idStr, parentIdStr, statusStr] = line.split(',');
      const id = parseInt(idStr);
      const parentId = parentIdStr && parentIdStr.trim() !== '' ? parseInt(parentIdStr) : null;
      const status = (statusStr?.trim() === 'Activo');

      const child = accountMap[id];
      if (!child) return;

      const updateData = { is_active: status };
      
      // Only set parent_id if specified and exists
      if (parentId && accountMap[parentId]) {
          updateData.parent_id = accountMap[parentId].id;
      } else if (parentId === null) {
          // If explicitly empty in Excel, maybe it means a parent? 
          // We'll leave it as null for now to be safe or set to null if it was something else.
          updateData.parent_id = null;
      }

      const { error: updError } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', child.id);

      if (updError) {
          console.error(`Error updating [${child.sku}] ${child.name}:`, updError.message);
          errorCount++;
      } else {
          updatedCount++;
          if (updatedCount % 100 === 0) console.log(`Processed ${updatedCount} updates...`);
      }
    }));
  }

  console.log('\n--- MIGRACIÓN COMPLETADA ---');
  console.log(`Productos actualizados exitosamente: ${updatedCount}`);
  console.log(`Errores durante la actualización: ${errorCount}`);
  console.log('--- El catálogo ahora debería reflejar las nuevas relaciones padre-hijo ---');
}

executeMigration();
