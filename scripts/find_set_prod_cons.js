const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialDailyMonitorModule.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
    if (l.includes('setProductConsolidated(')) {
        console.log('Call at line', idx + 1);
        console.log(lines.slice(idx - 35, idx + 5).join('\n'));
    }
});
