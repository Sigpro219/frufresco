const fs = require('fs');
const xml = fs.readFileSync('C:/Users/German Higuera/.gemini/antigravity/brain/b4b05e76-9a5e-4dd8-bd55-f7f423a23770/scratch_ajustes_doc/word/document.xml', 'utf8');

const regex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
let match;
let idx = 1;
while ((match = regex.exec(xml)) !== null) {
    const pXml = match[0];
    const textMatch = pXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
    const text = textMatch ? textMatch.map(t => t.replace(/<[^>]+>/g, '')).join('') : '';
    const imgMatch = pXml.match(/r:embed=\"(.*?)\"/g);
    if (text || imgMatch) {
        console.log(`[${idx}] Text: "${text}" | Imgs: ${imgMatch ? imgMatch.join(', ') : 'none'}`);
        idx++;
    }
}
