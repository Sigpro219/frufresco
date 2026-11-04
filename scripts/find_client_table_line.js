const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
    if (l.includes('filteredClients.map') || l.includes('Consumo por Cliente') || l.includes('Cliente / Razón Social')) {
        console.log(idx + 1, ':', l.trim());
    }
});
