const fs = require('fs');
const path = require('path');

function search(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
                search(fullPath);
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('Detalle del Pedido') || content.includes('ACCIONES') || content.includes('Conversión (')) {
                console.log(`Found in: ${fullPath}`);
            }
        }
    }
}

search('src');
