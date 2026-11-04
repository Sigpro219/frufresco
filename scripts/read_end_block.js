const fs = require('fs');
const lines = fs.readFileSync('scratch_clients_block.tsx', 'utf8').split('\n');
console.log('Total lines in scratch_clients_block:', lines.length);
console.log(lines.slice(130).join('\n'));
