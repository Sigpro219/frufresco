const fs = require('fs');
const content = fs.readFileSync('src/components/InventoryDailyBalanceTab.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('COLUMN_METADATA') || l.includes('const DEFAULT_COLUMN_ORDER') || l.includes('columnOrder,')) {
    console.log((idx+1) + ': ' + l.slice(0, 100));
  }
});
