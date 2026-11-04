const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const tempDir = path.join(os.tmpdir(), 'solicitudes_hallazgos_doc');
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

const srcDir = 'C:\\Users\\German Higuera\\OneDrive\\Desktop\\Solicitudes frufresco';
const docName = 'Hallazgos_documentaciB3n.docx';

try {
  execSync(`robocopy "${srcDir}" "${tempDir}" "${docName}" /R:1 /W:1`, { stdio: 'ignore' });
} catch (e) {
  // robocopy returns 1 on file copied
}

const copiedDoc = path.join(tempDir, docName);
console.log('Copied doc exists:', fs.existsSync(copiedDoc));

const unzipDir = path.join(tempDir, 'unzipped');
const psScript = `Add-Type -AssemblyName System.IO.Compression.FileSystem\n[System.IO.Compression.ZipFile]::ExtractToDirectory('${copiedDoc.replace(/\\/g, '\\\\')}', '${unzipDir.replace(/\\/g, '\\\\')}')\n`;
const psPath = path.join(tempDir, 'unzip.ps1');
fs.writeFileSync(psPath, psScript);

execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`);
console.log('Unzipped successfully.');

// Check document.xml
const docXmlPath = path.join(unzipDir, 'word', 'document.xml');
if (fs.existsSync(docXmlPath)) {
  const content = fs.readFileSync(docXmlPath, 'utf8');
  // Simple XML tag stripper for paragraphs
  const paragraphs = content.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  const textLines = paragraphs.map(p => {
    const textPieces = p.match(/<w:t[\s\S]*?>([\s\S]*?)<\/w:t>/g) || [];
    return textPieces.map(t => t.replace(/<[^>]+>/g, '')).join('');
  }).filter(line => line.trim().length > 0);

  console.log('--- EXTRACTED PARAGRAPHS ---');
  textLines.forEach((line, i) => console.log(`[P${i+1}] ${line}`));
}

// Media
const mediaDir = path.join(unzipDir, 'word', 'media');
if (fs.existsSync(mediaDir)) {
  const mediaFiles = fs.readdirSync(mediaDir);
  console.log('--- MEDIA FILES ---', mediaFiles);

  const artifactDir = 'C:\\Users\\German Higuera\\.gemini\\antigravity\\brain\\f86d6b1c-600b-494c-a3fd-97ea999f69ef';
  mediaFiles.forEach(f => {
    const src = path.join(mediaDir, f);
    const dest = path.join(artifactDir, `hallazgos_doc_${f}`);
    fs.copyFileSync(src, dest);
    console.log(`Copied ${f} to artifactDir as hallazgos_doc_${f}`);
  });
}
