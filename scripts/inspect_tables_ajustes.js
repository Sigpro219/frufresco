const fs = require('fs');

const xmlPath = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770\\scratch_ajustes_doc\\word\\document.xml';
const xml = fs.readFileSync(xmlPath, 'utf8');

// Check for tables
const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
const tables = xml.match(tblRegex) || [];
console.log('Total tables in document.xml:', tables.length);

tables.forEach((tbl, idx) => {
    console.log(`\n--- TABLE ${idx + 1} ---`);
    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    let text = '';
    while ((tMatch = tRegex.exec(tbl)) !== null) {
        text += tMatch[1] + ' | ';
    }
    console.log(text);
});
