const fs = require("fs");
const content = fs.readFileSync("src/lib/orderUtils.ts", "utf8");
const lines = content.split("\n");
const start = lines.findIndex(l => l.includes("function isRedundantAttribute") || l.includes("const isRedundantAttribute"));
console.log("isRedundantAttribute at line:", start + 1);
for (let i = start; i < start + 50 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
