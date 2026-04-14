
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = "C:\\Users\\Usuario\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Logos\\pruebas imagen producto\\Cargadas";
const TARGET_PATH = path.join(process.cwd(), 'temp_compressed_images');

if (!fs.existsSync(TARGET_PATH)) {
    fs.mkdirSync(TARGET_PATH);
}

async function processImages() {
    console.log('--- Scanning OneDrive for images ---');
    const files = fs.readdirSync(SOURCE_PATH);
    const mapping = {};

    files.forEach(file => {
        // Extract number from start of filename
        const match = file.match(/^(\d+)/);
        if (match) {
            const id = match[1];
            if (!mapping[id]) {
                mapping[id] = file; // First variant logic
            }
        }
    });

    const uniqueIds = Object.keys(mapping);
    console.log(`Found ${files.length} total files.`);
    console.log(`Mapped ${uniqueIds.length} unique accounting_ids.`);

    // Save mapping for next step
    fs.writeFileSync('image_mapping.json', JSON.stringify(mapping, null, 2));
    console.log('Mapping saved to image_mapping.json');

    console.log('\n--- Sample Mapping ---');
    uniqueIds.slice(0, 5).forEach(id => {
        console.log(`${id} => ${mapping[id]}`);
    });
}

processImages();
