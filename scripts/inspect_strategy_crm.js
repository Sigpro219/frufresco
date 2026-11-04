const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 450 to 510 ---');
console.log(lines.slice(450, 510).join('\n'));
