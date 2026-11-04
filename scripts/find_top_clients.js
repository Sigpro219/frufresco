const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
    if (l.includes('topClients') || l.includes('totalSpend') || l.includes('totalKg')) {
        console.log(idx + 1, ':', l.trim());
    }
});
