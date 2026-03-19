const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStorage() {
    console.log('--- Intentando crear bucket product-images ---');
    const { data, error } = await supabase.storage.createBucket('product-images', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
    });

    if (error) {
        if (error.message.includes('already exists')) {
            console.log('✅ El bucket already exists.');
        } else {
            console.error('❌ Error creating bucket:', error);
        }
    } else {
        console.log('✅ Bucket "product-images" creado exitosamente.');
    }
}

fixStorage();
