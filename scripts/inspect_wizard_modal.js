const fs = require('fs');
const content = fs.readFileSync('src/components/ManualDispatchWizardModal.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- States in ManualDispatchWizardModal ---');
lines.slice(0, 150).forEach((l, idx) => {
  if (l.includes('useState') || l.includes('Step') || l.includes('step')) {
    console.log(`L${idx + 1}: ${l.trim()}`);
  }
});
