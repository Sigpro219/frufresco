
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env from root
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = dotenv.parse(envContent);

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

async function setup() {
    console.log('--- Setting up Supabase Storage Bucket ---');
    
    // 1. Create bucket if not exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
        console.error('Error listing buckets:', listError.message);
        return;
    }

    if (!buckets.find(b => b.name === 'products')) {
        console.log('Creating "products" bucket...');
        const { error: createError } = await supabase.storage.createBucket('products', {
            public: true,
            fileSizeLimit: 10485760, // 10MB
            allowedMimeTypes: ['image/jpeg', 'image/png']
        });
        if (createError) console.error('Error creating bucket:', createError.message);
        else console.log('Bucket "products" created successfully.');
    } else {
        console.log('Bucket "products" already exists.');
    }

    console.log('Setup finished.');
}

setup();
