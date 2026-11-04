const fs = require('fs');
const content = fs.readFileSync('src/components/StagingSpacesManagement.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 310-350 ---');
console.log(lines.slice(310, 350).join('\n'));

console.log('--- Lines 620-660 ---');
console.log(lines.slice(620, 660).join('\n'));

console.log('--- Lines 990-1045 ---');
console.log(lines.slice(990, 1045).join('\n'));
