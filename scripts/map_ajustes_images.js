const fs = require('fs');
const path = require('path');

const xmlPath = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770\\scratch_ajustes_doc\\word\\document.xml';
const relsPath = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\b4b05e76-9a5e-4dd8-bd55-f7f423a23770\\scratch_ajustes_doc\\word\\_rels\\document.xml.rels';

const xml = fs.readFileSync(xmlPath, 'utf8');
const rels = fs.readFileSync(relsPath, 'utf8');

// Parse rels
const rIdToTarget = {};
const relRegex = /Id="([^"]+)"[^>]+Target="([^"]+)"/g;
let m;
while ((m = relRegex.exec(rels)) !== null) {
    rIdToTarget[m[1]] = m[2];
}

console.log('Rels mapping:', rIdToTarget);

// Match paragraphs and images in order
const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
let pMatch;
let pIdx = 1;
while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    let text = '';
    while ((tMatch = tRegex.exec(pContent)) !== null) {
        text += tMatch[1];
    }
    
    // Check for blip r:embed
    const blipRegex = /r:embed="([^"]+)"/g;
    let bMatch;
    const images = [];
    while ((bMatch = blipRegex.exec(pContent)) !== null) {
        const target = rIdToTarget[bMatch[1]] || bMatch[1];
        images.push(target);
    }

    if (text.trim() || images.length > 0) {
        console.log(`[P${pIdx}] ${text.trim()} ${images.length > 0 ? '--> IMAGES: ' + images.join(', ') : ''}`);
        pIdx++;
    }
}
