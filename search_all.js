const fs = require('fs');
const path = require('path');

function searchInDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
        searchInDir(fullPath, query);
      }
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(query)) {
        console.log(`Found in: ${fullPath}`);
      }
    }
  }
}

console.log("Searching for 89090006-1...");
searchInDir('.', '89090006-1');
console.log("Searching for Limón Tahití...");
searchInDir('.', 'Tahiti');
