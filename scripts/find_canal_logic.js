const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
    if (l.includes('b2bSales') || l.includes('b2cSales') || l.includes('clientType') || l.includes('isB2B')) {
        console.log(idx + 1, ':', l.trim());
    }
});
