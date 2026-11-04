const fs = require('fs');
const content = fs.readFileSync('src/components/StagingSpacesManagement.tsx', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(990, 1055).join('\n'));
