const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');
console.log('--- Lines 1820 to 1870 ---');
console.log(lines.slice(1820, 1870).join('\n'));
console.log('--- Lines 2440 to 2470 ---');
console.log(lines.slice(2440, 2470).join('\n'));
