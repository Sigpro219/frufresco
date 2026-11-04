const fs = require('fs');
const content = fs.readFileSync('SPEC.md', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(12080, 12130).join('\n'));
