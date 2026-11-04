const fs = require('fs');
const xml = fs.readFileSync('temp_detalles_pedidos/word/document.xml', 'utf8');

// Match paragraphs
const paragraphs = xml.split(/<\/w:p>/);
console.log('Total paragraphs:', paragraphs.length);

paragraphs.forEach((p, idx) => {
  const texts = [];
  const textMatches = p.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g);
  for (const m of textMatches) {
    texts.push(m[1]);
  }
  const fullText = texts.join('').trim();
  
  const imgMatches = p.matchAll(/r:embed="(rId\d+)"/g);
  const images = [];
  for (const im of imgMatches) {
    images.push(im[1]);
  }
  
  if (fullText || images.length > 0) {
    console.log(`[P${idx}] Text: "${fullText}" ${images.length ? 'Images: ' + images.join(', ') : ''}`);
  }
});

// Also read _rels/document.xml.rels to map rId to image filename
if (fs.existsSync('temp_detalles_pedidos/word/_rels/document.xml.rels')) {
  const rels = fs.readFileSync('temp_detalles_pedidos/word/_rels/document.xml.rels', 'utf8');
  console.log('\n--- Image Relationships ---');
  const relMatches = rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g);
  for (const rm of relMatches) {
    console.log(`${rm[1]} -> ${rm[2]}`);
  }
}
