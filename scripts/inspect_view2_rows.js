const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialDailyMonitorModule.tsx', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(1850, 1910).join('\n'));
