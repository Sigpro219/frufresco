const fs = require('fs');
const content = fs.readFileSync('src/components/InventoryDailyBalanceTab.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('<th') || l.includes('VENTA (UND)') || l.includes('VENTA (KG)')) {
    console.log((idx+1) + ': ' + l.slice(0, 100));
  }
});
