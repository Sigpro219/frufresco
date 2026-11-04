const fs = require('fs');
const content = fs.readFileSync('SPEC.md', 'utf8');
const lines = content.split('\n');
console.log('Total lines in SPEC.md:', lines.length);
console.log(lines.slice(lines.length - 40).join('\n'));
