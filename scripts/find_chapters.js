const fs = require("fs");
const lines = fs.readFileSync("SPEC.md", "utf8").split("\n");
const chapters = lines.filter(l => l.startsWith("## ") || l.startsWith("# "));
console.log("Found headings:", chapters.slice(-10));
