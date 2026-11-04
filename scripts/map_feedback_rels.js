const fs = require('fs');
const rels = fs.readFileSync('temp_feedback_sabana/word/_rels/document.xml.rels', 'utf8');
const regex = /Id="([^"]+)"[^>]*Target="([^"]+)"/g;
let match;
while ((match = regex.exec(rels)) !== null) {
  console.log(match[1] + ' -> ' + match[2]);
}
