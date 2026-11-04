const fs = require('fs');
const content = fs.readFileSync('src/components/ManualDispatchWizardModal.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('step1Confirmed') || l.includes('step2Confirmed') || l.includes('step3Confirmed') || l.includes('step4Confirmed')) {
    console.log(`L${idx + 1}: ${l.trim()}`);
  }
});
