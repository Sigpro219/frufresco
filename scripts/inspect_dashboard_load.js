const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
    if (l.includes('useEffect') || l.includes('async function') || l.includes('const fetch') || l.includes('kpis =')) {
        console.log(idx + 1, ':', l.trim());
    }
});
