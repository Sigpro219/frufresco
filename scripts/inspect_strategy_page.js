const fs = require('fs');
const content = fs.readFileSync('src/app/admin/strategy/page.tsx', 'utf8');
const lines = content.split('\n');

console.log('Total lines in strategy/page.tsx:', lines.length);
console.log(lines.slice(0, 40).join('\n'));
