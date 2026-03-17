const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/lib/sync-status.ts');
const now = new Date().toISOString();

const content = `export const SYNC_METADATA = {
  lastSync: "${now}",
  version: "1.0.0",
  environment: "CORE"
};
`;

fs.writeFileSync(filePath, content);
console.log(`✅ Sync metadata updated: ${now}`);
