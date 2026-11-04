const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 1230 to 1290 ---');
console.log(lines.slice(1230, 1290).join('\n'));
