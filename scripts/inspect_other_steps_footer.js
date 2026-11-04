const fs = require('fs');
const content = fs.readFileSync('src/components/ManualDispatchWizardModal.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Paso 2 Footer (lines 1305-1345) ---');
console.log(lines.slice(1305, 1345).join('\n'));

console.log('\n--- Paso 3 Footer (lines 1450-1490) ---');
console.log(lines.slice(1450, 1490).join('\n'));
