const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
    if (l.includes('Mix de Facturación') || l.includes('Mix de Utilidad') || l.includes('📊') || l.includes('💰')) {
        console.log(idx + 1, ':', l.trim());
    }
});
