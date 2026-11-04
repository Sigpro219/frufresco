const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

const mixIdx = lines.findIndex(l => l.includes('Mix de Canales Comerciales'));
console.log('mixIdx:', mixIdx);
console.log(lines.slice(mixIdx - 10, mixIdx + 60).join('\n'));
