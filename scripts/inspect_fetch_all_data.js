const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 570 to 650 ---');
console.log(lines.slice(570, 650).join('\n'));

console.log('--- Lines 720 to 800 ---');
console.log(lines.slice(720, 800).join('\n'));
