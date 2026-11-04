const fs = require('fs');
const content = fs.readFileSync('src/components/CommercialUnifiedDashboard.tsx', 'utf8');
const lines = content.split('\n');

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
lines.forEach((l, idx) => {
    if (emojiRegex.test(l)) {
        console.log(idx + 1, ':', l.trim());
    }
});
