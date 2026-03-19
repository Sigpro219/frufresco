const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5NjEsImV4cCI6MjA4ODI1Mjk2MX0.abZSNz1sQI0jGOFXopBOSRj1Hw3coU1sTR7LeuFpn5M';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching products:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns in products table:', Object.keys(data[0]));
    } else {
        console.log('No products found in table.');
    }
}

checkColumns();
