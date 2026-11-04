const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const tempDir = path.join(os.tmpdir(), 'solicitudes_revision_acuerdo1');
if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

const srcDir = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\Solicitudes frufresco';
const files = fs.readdirSync(srcDir);
const target = files.find(f => f.toLowerCase().includes('acuerdo1') || f.toLowerCase().includes('revisib3n_acuerdo1'));
console.log('Target file found:', target);

if (!target) process.exit(1);

try {
  execSync(`robocopy "${srcDir}" "${tempDir}" "${target}" /R:1 /W:1`, { stdio: 'ignore' });
} catch(e) {}

const copiedDoc = path.join(tempDir, target);
console.log('Copied exists:', fs.existsSync(copiedDoc));

const unzipDir = path.join(tempDir, 'unzipped');
const psScript = `Add-Type -AssemblyName System.IO.Compression.FileSystem;\n[System.IO.Compression.ZipFile]::ExtractToDirectory('${copiedDoc.replace(/\\/g, '\\\\')}', '${unzipDir.replace(/\\/g, '\\\\')}');\n`;
const psPath = path.join(tempDir, 'unzip.ps1');
fs.writeFileSync(psPath, psScript);
execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`);
console.log('Unzipped successfully.');

const docXmlPath = path.join(unzipDir, 'word', 'document.xml');
const relsPath = path.join(unzipDir, 'word', '_rels', 'document.xml.rels');
const relsXml = fs.readFileSync(relsPath, 'utf8');
const rels = {};
const relMatches = relsXml.match(/<Relationship[^>]*>/g) || [];
relMatches.forEach(r => {
  const idMatch = r.match(/Id="([^"]+)"/);
  const targetMatch = r.match(/Target="([^"]+)"/);
  if (idMatch && targetMatch) rels[idMatch[1]] = targetMatch[1];
});

const content = fs.readFileSync(docXmlPath, 'utf8');
const paragraphs = content.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
console.log('--- PARAGRAPH MAPPING ---');
paragraphs.forEach((p, idx) => {
  const textPieces = p.match(/<w:t[\s\S]*?>([\s\S]*?)<\/w:t>/g) || [];
  const text = textPieces.map(t => t.replace(/<[^>]+>/g, '')).join('');
  const imgMatches = p.match(/r:embed="([^"]+)"/g) || [];
  const imgFiles = imgMatches.map(m => {
    const id = m.match(/r:embed="([^"]+)"/)[1];
    return rels[id];
  });
  if (text.trim() || imgFiles.length > 0) {
    console.log(`[P${idx+1}] Text: "${text.trim()}" | Images: ${JSON.stringify(imgFiles)}`);
  }
});

const mediaDir = path.join(unzipDir, 'word', 'media');
if (fs.existsSync(mediaDir)) {
  const mediaFiles = fs.readdirSync(mediaDir);
  console.log('--- MEDIA FILES ---', mediaFiles);
  const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\f86d6b1c-600b-494c-a3fd-97ea999f69ef';
  mediaFiles.forEach(f => {
    const src = path.join(mediaDir, f);
    const dest = path.join(artifactDir, `acuerdo1_${f}`);
    fs.copyFileSync(src, dest);
    console.log(`Copied ${f} to artifactDir as acuerdo1_${f}`);
  });
}
