const fs = require('fs');
const content = fs.readFileSync('src/app/admin/orders/create/page.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
    if (line.includes('variantQuantity') && (line.includes('<input') || line.includes('onChange'))) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});
