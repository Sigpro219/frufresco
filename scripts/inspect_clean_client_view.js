const fs = require('fs');
const { execSync } = require('child_process');

const repoPath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco';
const cleanContent = execSync('git show 896365b1:src/components/CommercialDailyMonitorModule.tsx', {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
});

const lines = cleanContent.split(/\r?\n/);
const clientIdx = lines.findIndex(l => l.includes("activeView === 'clients' && ("));
const prodIdx = lines.findIndex(l => l.includes("activeView === 'products' && ("));
const drillIdx = lines.findIndex(l => l.includes("activeView === 'product_drilldown' && ("));

console.log({ clientIdx, prodIdx, drillIdx });

const cleanClientView = lines.slice(clientIdx, prodIdx).join('\n');
console.log('Clean Client View length:', cleanClientView.length);
console.log('First 20 lines of clean client view:\n', lines.slice(clientIdx, clientIdx + 20).join('\n'));
console.log('Last 20 lines of clean client view:\n', lines.slice(prodIdx - 20, prodIdx).join('\n'));
