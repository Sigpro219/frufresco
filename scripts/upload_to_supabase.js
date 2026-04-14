
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = dotenv.parse(envContent);

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'products';
const LOCAL_DIR = path.join(__dirname, '../temp_compressed_images');

async function uploadAndUpdate() {
    console.log('--- Starting Bulk Upload & DB Update ---');
    
    if (!fs.existsSync(LOCAL_DIR)) {
        console.error('Local directory not found.');
        return;
    }

    const files = fs.readdirSync(LOCAL_DIR);
    console.log(`Found ${files.length} images to upload.`);

    for (const file of files) {
        const id = path.parse(file).name; // Extract number from filename (e.g. "106")
        const filePath = path.join(LOCAL_DIR, file);
        const fileBuffer = fs.readFileSync(filePath);
        
        console.log(`Uploading ${file}...`);

        // 1. Upload to Storage
        const { data, error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(file, fileBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadError) {
            console.error(`Error uploading ${file}:`, uploadError.message);
            continue;
        }

        // 2. Get Public URL
        const publicUrl = `${envConfig.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${file}`;
        
        // 3. Update Database
        const { error: dbError } = await supabase
            .from('products')
            .update({ image_url: publicUrl })
            .eq('accounting_id', parseInt(id));

        if (dbError) {
            console.error(`Error updating DB for ID ${id}:`, dbError.message);
        } else {
            console.log(`✅ ID ${id} updated with public URL.`);
        }
    }

    console.log('\n--- Finished processing chunk ---');
}

uploadAndUpdate();
