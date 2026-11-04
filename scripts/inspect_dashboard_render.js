const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 1880 to 2020 ---');
console.log(lines.slice(1880, 2020).join('\n'));
