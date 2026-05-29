const fs = require('fs');
const path = require('path');

function walk(dir, filelist = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walk(filepath, filelist);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
            filelist.push(filepath);
        }
    }
    return filelist;
}

const files = walk(path.join(process.cwd(), 'src'));
console.log(`Found ${files.length} code files. Searching for rpc calls...`);

for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('.rpc(')) {
        console.log(`Match in ${file}:`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('.rpc(')) {
                console.log(`  Line ${idx + 1}: ${line.trim()}`);
            }
        });
    }
}
