const fs = require('fs');
const content = fs.readFileSync('temp_feedback_sabana/word/document.xml', 'utf8');

// Parse paragraphs and image drawings
const paragraphs = content.split('</w:p>');
paragraphs.forEach((p, i) => {
  const text = p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const imgMatches = p.match(/r:embed="([^"]+)"/g) || [];
  if (text.length > 3 || imgMatches.length > 0) {
    console.log(`[P${i}] ${text} ${imgMatches.length > 0 ? `(IMG: ${imgMatches.join(', ')})` : ''}`);
  }
});
