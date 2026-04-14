
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_DIR = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\pruebas imagen producto\\Cargadas";
const TARGET_DIR = path.join(process.cwd(), 'temp_compressed_images');
const MAPPING_FILE = 'image_mapping.json';

if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR);
}

function compress() {
    console.log('--- Starting Image Compression (Stable V3) ---');
    if (!fs.existsSync(MAPPING_FILE)) {
        console.error('Error: image_mapping.json not found.');
        return;
    }
    const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    const ids = Object.keys(mapping);
    const total = ids.length;

    console.log(`Processing ${total} images...`);

    ids.forEach((id, index) => {
        const filename = mapping[id];
        const sourceFile = path.join(SOURCE_DIR, filename);
        const targetFilename = `${id}.jpg`;
        const targetFile = path.join(TARGET_DIR, targetFilename);

        if (fs.existsSync(targetFile)) {
             return; // Skip existing
        }

        console.log(`[${index + 1}/${total}] Processing ${filename}...`);

        try {
            // Force a simple read to trigger OneDrive hydration if needed
            fs.accessSync(sourceFile, fs.constants.R_OK);
            
            // Execute sharp-cli with timeout
            execSync(`npx -y sharp-cli -i "${sourceFile}" -o "${targetFile}" resize 800`, { 
                stdio: 'ignore', 
                timeout: 30000 
            });
            console.log(`   ✅ Success: ${targetFilename}`);
        } catch (err) {
            console.error(`   ❌ Failed: ${filename} - ${err.message.split('\n')[0]}`);
            // Non-blocking failure
        }
    });

    console.log('\n--- Compression Phase Finished ---');
    console.log(`Check images in: ${TARGET_DIR}`);
}

compress();
