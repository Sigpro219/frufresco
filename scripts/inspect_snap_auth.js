const fs = require('fs');
const content = fs.readFileSync('scripts/snap_agreement_drawer.js', 'utf8');
console.log(content.slice(0, 800));
