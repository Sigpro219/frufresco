const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

console.log('Total lines in StrategyControlTower.tsx:', lines.length);

lines.forEach((l, idx) => {
    if (l.includes('Concentración') || l.includes('Pareto') || l.includes('Clientes & Conversión') || l.includes('subtab === 3') || l.includes('activeSubtab === 3') || l.includes('clients')) {
        console.log(idx + 1, ':', l.trim());
    }
});
