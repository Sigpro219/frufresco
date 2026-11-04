const fs = require("fs");
const content = fs.readFileSync("src/lib/orderUtils.ts", "utf8");
const lines = content.split("\n");
const start = 480;
for (let i = start; i < start + 80 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
