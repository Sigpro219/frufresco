const fs = require('fs');
let code = fs.readFileSync('src/app/admin/orders/contingency-print/page.tsx', 'utf8');

const startMarker = '{/* Regla de Confidencialidad Comercial:';
const endMarker = '{/* Client & Route Micro-Grid */}';

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    code = code.slice(0, startIdx) + code.slice(endIdx);
    fs.writeFileSync('src/app/admin/orders/contingency-print/page.tsx', code, 'utf8');
    console.log('Successfully removed special_attention from remissions in contingency-print/page.tsx');
} else {
    console.error('Markers not found in contingency-print/page.tsx');
}
