const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function exportAllToCsv() {
  const { data: variants, error } = await supabase
    .from('products')
    .select('id, name, sku, base_price, unit_of_measure, parent_id')
    .not('parent_id', 'is', null);

  if (error) {
    console.error('Fetch Variants Error:', error);
    return;
  }

  if (!variants || variants.length === 0) {
      console.log('No variants found.');
      return;
  }

  const parentIds = [...new Set(variants.map(v => v.parent_id))];
  const { data: parents, error: pError } = await supabase
    .from('products')
    .select('id, name, sku')
    .in('id', parentIds);

  if (pError) {
      console.error('Fetch Parents Error:', pError);
      return;
  }

  const parentMap = parents.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

  const rows = variants.map(v => {
      const p = parentMap[v.parent_id] || { name: 'Unknown', sku: 'N/A' };
      return `"${p.name}","${p.sku}","${v.name}","${v.sku}",${v.base_price || 0},"${v.unit_of_measure || 'Unidad'}"`;
  });

  const header = 'Parent Name,Parent SKU,Child Name,Child SKU,Price,Unit';
  const csv = [header, ...rows].join('\n');
  
  require('fs').writeFileSync('relaciones_productos.csv', csv, { overwrite: true });
  console.log(`Successfully exported ${variants.length} relations to relaciones_productos.csv`);
}

exportAllToCsv();
