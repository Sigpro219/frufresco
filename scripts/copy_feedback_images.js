const fs = require('fs');
const path = require('path');

const srcDir = 'temp_feedback_sabana/word/media';
const destDir = 'C:/Users/German Higuera/.gemini/antigravity/brain/f86d6b1c-600b-494c-a3fd-97ea999f69ef';

if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir);
  files.forEach(f => {
    if (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')) {
      const src = path.join(srcDir, f);
      const dest = path.join(destDir, 'feedback_sabana_' + f);
      fs.copyFileSync(src, dest);
      console.log('Copied ' + f + ' -> feedback_sabana_' + f);
    }
  });
}
