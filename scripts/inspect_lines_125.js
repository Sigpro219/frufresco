const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 125 to 175 ---');
console.log(lines.slice(125, 175).join('\n'));
