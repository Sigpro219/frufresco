const fs = require('fs');
const content = fs.readFileSync('src/components/ManualDispatchWizardModal.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Paso 4 Footer (lines 1650-1700) ---');
console.log(lines.slice(1650, 1700).join('\n'));
