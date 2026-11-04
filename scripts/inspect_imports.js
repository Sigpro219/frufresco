const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 1 to 50 ---');
console.log(lines.slice(0, 50).join('\n'));
