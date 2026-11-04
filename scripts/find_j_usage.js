const fs = require('fs');
const content = fs.readFileSync('src/components/InventoryDailyBalanceTab.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('\'J\'') || l.includes('\"J\"') || l.includes('totalJ') || l.includes('case \'J\'') || l.includes('case \"J\"')) {
    console.log((idx+1) + ': ' + l.slice(0, 100));
  }
});
