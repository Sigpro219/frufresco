const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg0MTc0NTcyfQ.lJ4JSQlzJAW6QW0Mo4UuG7QxcXTXw5iihVO_k6RS-eU'
);

async function exportRelations() {
  console.log('Fetching products from FruFresco production...');
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sku, base_price, unit_of_measure, parent_id, variants');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`Fetched ${products.length} products.`);

  // Build a map of products for easy lookup
  const productMap = {};
  products.forEach(p => {
    productMap[p.id] = p;
  });

  const relations = [];

  // Method 1: Logic based on parent_id column
  products.forEach(p => {
    if (p.parent_id) {
      const parent = productMap[p.parent_id];
      relations.push({
        parent_name: parent ? parent.name : 'Unknown Parent',
        parent_sku: parent ? parent.sku : 'N/A',
        child_name: p.name,
        child_sku: p.sku,
        child_price: p.base_price,
        child_unit: p.unit_of_measure
      });
    }
    
    // Method 2: If variants column has data (it might be redundant but let's check)
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      p.variants.forEach(v => {
        // If this child is already in relations under this parent, skip
        const exists = relations.some(r => 
          r.parent_name === p.name && 
          r.child_name === (v.name || v.options?.Tipo || v.id)
        );
        
        if (!exists) {
          relations.push({
            parent_name: p.name,
            parent_sku: p.sku,
            child_name: v.name || JSON.stringify(v.options || {}),
            child_sku: v.sku || 'N/A',
            child_price: v.price || v.base_price,
            child_unit: v.unit_of_measure || p.unit_of_measure
          });
        }
      });
    }
  });

  if (relations.length === 0) {
    console.log('No parent-child relations found.');
    return;
  }

  // Convert to CSV
  const header = 'Parent Name,Parent SKU,Child Name,Child SKU,Price,Unit\n';
  const rows = relations.map(r => 
    `"${r.parent_name}","${r.parent_sku}","${r.child_name}","${r.child_sku}",${r.child_price},"${r.child_unit}"`
  ).join('\n');

  const csvContent = header + rows;
  fs.writeFileSync('relaciones_productos.csv', csvContent);
  console.log('Successfully exported to relaciones_productos.csv');
}

exportRelations();
