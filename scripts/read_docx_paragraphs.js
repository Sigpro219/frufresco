const fs = require('fs');
const content = fs.readFileSync('temp_detalles_pedidos/word/document.xml', 'utf8');
const paragraphs = content.split('</w:p>');
paragraphs.forEach((p, i) => {
  const text = p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > 5) {
    console.log('[P' + i + '] ' + text);
  }
});
