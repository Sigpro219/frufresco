const fs = require('fs');

const content = fs.readFileSync('src/components/EmailDraftsModule.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, i) => {
  if (line.includes('texto original') || line.includes('email_body')) {
    console.log(`${i+1}: ${line.trim()}`);
  }
});
