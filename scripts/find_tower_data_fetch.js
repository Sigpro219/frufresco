const fs = require('fs');
const content = fs.readFileSync('src/components/admin/StrategyControlTower.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
    if (l.includes('from(\'orders\')') || l.includes('from(\'order_items\')') || l.includes('cost_matrix') || l.includes('commercial_cost_matrix')) {
        console.log(idx + 1, ':', l.trim());
    }
});
