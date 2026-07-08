const fs = require('fs');
const content = fs.readFileSync('src/app/admin/orders/loading/page.tsx', 'utf8');
const lines = content.split('\n');

const keywords = ['customPriceIds', 'resolveContract', 'drawer', 'Modificar', 'isOrderLocked', 'iva_rate', 'IVA Estimado', 'product_conversions'];

keywords.forEach(kw => {
    console.log(`=== Matches for "${kw}": ===`);
    lines.forEach((line, idx) => {
        if (line.includes(kw)) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    });
});
