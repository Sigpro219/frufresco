const fs = require('fs');
const content = fs.readFileSync('src/components/ManualDispatchWizardModal.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- Lines 1090-1140 (Paso 1 Footer) ---');
console.log(lines.slice(1090, 1140).join('\n'));
