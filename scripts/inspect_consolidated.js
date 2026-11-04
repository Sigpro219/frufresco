const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialDailyMonitorModule.tsx', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('setProductConsolidated'));
console.log('Index of setProductConsolidated:', idx);
console.log(lines.slice(idx - 40, idx + 10).join('\n'));
