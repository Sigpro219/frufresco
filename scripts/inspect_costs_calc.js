const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 800 to 920 ---');
console.log(lines.slice(800, 920).join('\n'));
