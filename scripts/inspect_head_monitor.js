const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialDailyMonitorModule.tsx', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
lines.forEach((l, idx) => {
    if (l.includes('activeView ===')) {
        console.log(idx + 1, ':', l.trim());
    }
});
