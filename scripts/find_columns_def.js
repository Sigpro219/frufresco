const fs = require('fs');
const content = fs.readFileSync('src/components/InventoryDailyBalanceTab.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('PESO (UND)') || l.includes('colKeys') || l.includes('columns =') || l.includes('COLUMNS =') || l.includes('orderedCols') || l.includes('visibleCols')) {
    console.log((idx+1) + ': ' + l.slice(0, 100));
  }
});
