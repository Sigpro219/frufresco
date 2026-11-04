const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 2440 to 2510 ---');
console.log(lines.slice(2440, 2510).join('\n'));
