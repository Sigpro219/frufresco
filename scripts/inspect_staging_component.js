const fs = require('fs');
const content = fs.readFileSync('src/components/StagingSpacesManagement.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('sobra') || l.includes('Ajustar a') || l.includes('bahías') || l.includes('bahias')) {
    console.log(`L${idx + 1}: ${l.trim()}`);
  }
});
