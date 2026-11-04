const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 430 to 475 ---');
console.log(lines.slice(430, 475).join('\n'));
