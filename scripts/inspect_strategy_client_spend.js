const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 460 to 520 ---');
console.log(lines.slice(460, 520).join('\n'));
