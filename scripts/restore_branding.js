
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = dotenv.parse(envContent);
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY);

const LOGO_PATH = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\logo completo.png";
const SYMBOL_PATH = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\logo simbolo sin fondo.png";
const HERO_PATH = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\hero.png";

const TEMP_DIR = path.join(process.cwd(), 'temp_branding');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

async function restore() {
    console.log('--- Restoring Branding Assets (Stable) ---');
    
    const assets = [
        { name: 'logo_main.png', path: LOGO_PATH, key: 'app_logo_url' },
        { name: 'logo_symbol.png', path: SYMBOL_PATH, key: 'app_logosymbol_url' },
        { name: 'hero_main.jpg', path: HERO_PATH, key: 'app_hero_image_url' }
    ];

    for (const asset of assets) {
        console.log(`Processing ${asset.name}...`);
        const tempPath = path.join(TEMP_DIR, asset.name);
        
        try {
            // Stable Compression syntax
            const size = asset.name.includes('hero') ? 1920 : 800;
            execSync(`npx -y sharp-cli -i "${asset.path}" -o "${tempPath}" resize ${size}`, { stdio: 'pipe' });

            // Upload
            const buffer = fs.readFileSync(tempPath);
            const { error: uploadError } = await supabase.storage
                .from('branding')
                .upload(asset.name, buffer, { upsert: true, contentType: asset.name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });

            if (uploadError) throw uploadError;

            const publicUrl = `${envConfig.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${asset.name}`;
            
            // Update DB
            const { data: existing } = await supabase.from('app_settings').select('key').eq('key', asset.key).single();
            if (existing) {
                await supabase.from('app_settings').update({ value: publicUrl }).eq('key', asset.key);
            } else {
                await supabase.from('app_settings').insert({ key: asset.key, value: publicUrl, description: 'Restaurado desde OneDrive' });
            }
            
            console.log(`✅ ${asset.key} updated: ${publicUrl}`);
        } catch (err) {
            console.error(`❌ Error with ${asset.name}:`, err.message);
        }
    }
    console.log('--- Branding Restoration Finished ---');
}

restore();
