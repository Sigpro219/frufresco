const fs = require("fs");
const content = fs.readFileSync("src/app/admin/orders/alistamiento-print/page.tsx", "utf8");
const lines = content.split("\n");
const start = lines.findIndex(l => l.includes("function normalizeToKg"));
console.log("normalizeToKg found at line:", start + 1);
for (let i = start; i < start + 90 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
