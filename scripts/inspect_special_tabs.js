const fs = require('fs');
const content = fs.readFileSync('src/components/SpecialAgreementsModule.tsx', 'utf8');
const lines = content.split('\n');

// Find where models/tabs are defined
lines.forEach((l, idx) => {
    if (l.includes('nutresa') || l.includes('colsubsidio') || l.includes('general_quincenal') || l.includes('general_mensual')) {
        console.log(idx + 1, ':', l.trim());
    }
});
