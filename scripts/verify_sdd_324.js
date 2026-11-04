const fs = require("fs");
const path = require("path");

// Read orderUtils.ts
const code = fs.readFileSync(path.resolve(__dirname, "../src/lib/orderUtils.ts"), "utf8");

// Assert that the check for maduro exists in formatStructuredSpecification
const hasMaduroFilter = code.includes("lowerVal === 'maduro' || lowerVal === 'madura'");
console.log("formatStructuredSpecification has maduro filter:", hasMaduroFilter);

// Read QuickViewModal.tsx
const qvCode = fs.readFileSync(path.resolve(__dirname, "../src/components/QuickViewModal.tsx"), "utf8");
const hasQvFilter = qvCode.includes("clean !== 'maduro' && clean !== 'madura'");
console.log("QuickViewModal.tsx has maduro filter:", hasQvFilter);

// Read ProductDetailClient.tsx
const pdCode = fs.readFileSync(path.resolve(__dirname, "../src/components/ProductDetailClient.tsx"), "utf8");
const hasPdFilter = pdCode.includes("clean !== 'maduro' && clean !== 'madura'");
console.log("ProductDetailClient.tsx has maduro filter:", hasPdFilter);

if (hasMaduroFilter && hasQvFilter && hasPdFilter) {
  console.log("ALL CHECKS PASSED DETERMINISTICALLY");
} else {
  console.error("SOME CHECK FAILED");
  process.exit(1);
}
