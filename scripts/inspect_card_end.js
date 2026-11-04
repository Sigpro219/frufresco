const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 1930 to 1965 ---');
console.log(lines.slice(1930, 1965).join('\n'));
