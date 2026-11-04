const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const docPath = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\Solicitudes frufresco\\AJUSTES_ANTES_REVISION_INDICADORES__AREA_COMERCIAL.docx';
console.log('Doc exists:', fs.existsSync(docPath));

const zip = new AdmZip(docPath);
const zipEntries = zip.getEntries();

const xmlEntry = zipEntries.find(e => e.entryName === 'word/document.xml');
if (!xmlEntry) {
    console.error('word/document.xml not found!');
    process.exit(1);
}

const xml = xmlEntry.getData().toString('utf8');

// Extract text from w:p and w:t
const paragraphs = [];
const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
let match;
while ((match = pRegex.exec(xml)) !== null) {
    const pContent = match[1];
    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    let text = '';
    while ((tMatch = tRegex.exec(pContent)) !== null) {
        text += tMatch[1];
    }
    if (text.trim()) {
        paragraphs.push(text.trim());
    }
}

console.log('--- EXTRACTED PARAGRAPHS FROM AJUSTES_ANTES_REVISION_INDICADORES__AREA_COMERCIAL.docx ---');
paragraphs.forEach((p, idx) => console.log(`[P${idx + 1}] ${p}`));

// Check images
const mediaEntries = zipEntries.filter(e => e.entryName.startsWith('word/media/'));
console.log('--- MEDIA FILES ---', mediaEntries.map(e => e.entryName));

const scratchMedia = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770\\scratch_ajustes_doc';
if (!fs.existsSync(scratchMedia)) fs.mkdirSync(scratchMedia, { recursive: true });

mediaEntries.forEach(e => {
    const filename = path.basename(e.entryName);
    fs.writeFileSync(path.join(scratchMedia, filename), e.getData());
    const artPath = path.join('C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770', 'ajustes_comercial_' + filename);
    fs.writeFileSync(artPath, e.getData());
    console.log(`Saved ${filename} to ${artPath}`);
});
