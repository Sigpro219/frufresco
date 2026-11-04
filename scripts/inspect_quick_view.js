const fs = require("fs");
const content = fs.readFileSync("src/components/QuickViewModal.tsx", "utf8");
const lines = content.split("\n");
for (let i = 210; i < 245; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
