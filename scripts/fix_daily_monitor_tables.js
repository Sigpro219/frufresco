const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoPath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco';
const monitorPath = path.join(repoPath, 'src\\components\\CommercialDailyMonitorModule.tsx');

const cleanContent = execSync('git show 896365b1:src/components/CommercialDailyMonitorModule.tsx', {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
});

const cleanLines = cleanContent.split(/\r?\n/);
const cleanClientIdx = cleanLines.findIndex(l => l.includes("activeView === 'clients' && ("));
const cleanProdIdx = cleanLines.findIndex(l => l.includes("activeView === 'products' && ("));
const cleanDrillIdx = cleanLines.findIndex(l => l.includes("activeView === 'product_drilldown' && ("));

console.log('Clean indices:', { cleanClientIdx, cleanProdIdx, cleanDrillIdx });

// Now let's extract the clean Clients View table block
const originalClientsBlock = cleanLines.slice(cleanClientIdx, cleanProdIdx).join('\n');
fs.writeFileSync(path.join(repoPath, 'scratch_clients_block.tsx'), originalClientsBlock, 'utf8');
console.log('Saved scratch_clients_block.tsx, length:', originalClientsBlock.length);
