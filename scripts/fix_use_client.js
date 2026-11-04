const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/CommercialUnifiedDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// Remove interface if it is before 'use client'
const interfaceRegex = /interface ChannelPerformanceItem[\s\S]*?\n}\n*/;
const match = content.match(interfaceRegex);

if (match && content.indexOf(match[0]) < content.indexOf("'use client'")) {
    const ifaceText = match[0];
    content = content.replace(ifaceText, '');
    content = content.trimStart();
    // Ensure 'use client' is line 1
    if (content.startsWith("'use client';")) {
        // Place interface after the import section
        const importEndIdx = content.indexOf("import SpecialClientBadge from './SpecialClientBadge';");
        if (importEndIdx !== -1) {
            const insertPos = importEndIdx + "import SpecialClientBadge from './SpecialClientBadge';".length;
            content = content.substring(0, insertPos) + '\n\n' + ifaceText.trim() + '\n' + content.substring(insertPos);
        }
    }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully positioned use client at line 1!');
