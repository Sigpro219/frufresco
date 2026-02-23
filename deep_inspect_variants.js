const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo'
);

async function check() {
  // Try to find ANY record or just get columns
  const { data, error } = await supabase.from('product_variants').select('*').limit(1);
  
  if (error) {
    console.log('Error fetching:', error);
  } else {
    console.log('Table exists and query successful.');
    if (data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
    } else {
      console.log('Table is empty. Attempting to insert dummy to see columns (then delete)...');
      const { data: insData, error: insError } = await supabase
        .from('product_variants')
        .insert({ product_id: '00000000-0000-0000-0000-000000000000', sku: 'DUMMY' })
        .select();
      
      if (insError) {
        console.log('Insert error (expected if product_id invalid):', insError.message);
        // Sometimes the error message contains hints about columns.
        if (insError.message.includes('column')) {
            console.log('Column related error:', insError.message);
        }
      } else {
        console.log('Insert worked (weird). Columns:', Object.keys(insData[0]));
        await supabase.from('product_variants').delete().eq('sku', 'DUMMY');
      }
    }
  }
}
check();
