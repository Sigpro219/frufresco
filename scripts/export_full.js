const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function exportFull() {
  console.log('Fetching relations from both patterns...');
  
  // Pattern 1: Same table (self-referencing parent_id)
  const { data: products, error: pError } = await supabase
    .from('products')
    .select('id, name, sku, base_price, parent_id');
  
  if (pError) console.error('PError:', pError);

  // Pattern 2: Separate table
  const { data: variants, error: vError } = await supabase
    .from('product_variants')
    .select('*, product:product_id(name, sku)');
    
  if (vError) console.error('VError:', vError);

  const results = [];

  const prodMap = {};
  if (products) {
    products.forEach(p => {
        prodMap[p.id] = p;
    });
    
    products.forEach(p => {
        if (p.parent_id) {
            const parent = prodMap[p.parent_id];
            results.push({
                parent: parent ? parent.name : 'Unknown',
                child: p.name,
                sku: p.sku,
                price: p.base_price
            });
        }
    });
  }

  if (variants) {
    variants.forEach(v => {
        results.push({
            parent: v.product ? v.product.name : 'Unknown',
            child: v.name || v.sku,
            sku: v.sku,
            price: v.price
        });
    });
  }

  console.log(`Found ${results.length} total relations.`);
  if (results.length > 0) {
      const csv = 'Parent,Child,SKU,Price\n' + results.map(r => `"${r.parent}","${r.child}","${r.sku}",${r.price}`).join('\n');
      require('fs').writeFileSync('relaciones_final.csv', csv);
      console.log('Exported to relaciones_final.csv');
  }
}

exportFull();
