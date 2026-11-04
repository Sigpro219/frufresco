const fs = require("fs");
const path = require("path");

// 1. Patch src/lib/orderUtils.ts
const orderUtilsPath = path.resolve(__dirname, "../src/lib/orderUtils.ts");
let orderUtils = fs.readFileSync(orderUtilsPath, "utf8");

const targetOrderUtils = `    // 2. Extract valid culinary attributes (Maduración, Corte, Calibre, etc.)
    const knownKeys = ['Maduración', 'Maduracion', 'Corte', 'Calibre', 'Punto', 'Especificación', 'Especificacion'];
    knownKeys.forEach(k => {
        if (opts[k] && typeof opts[k] === 'string' && opts[k].trim()) {
            const val = opts[k].trim();
            if (!/^\\d+$/.test(val) && val.toLowerCase() !== 'estandar' && val.toLowerCase() !== 'estándar') {
                if (!isRedundantAttribute(val, prodName)) {
                    attributeParts.push(val);
                }
            }
        }
    });`;

const replacementOrderUtils = `    // 2. Extract valid culinary attributes (Maduración, Corte, Calibre, etc.)
    const knownKeys = ['Maduración', 'Maduracion', 'Corte', 'Calibre', 'Punto', 'Especificación', 'Especificacion'];
    knownKeys.forEach(k => {
        if (opts[k] && typeof opts[k] === 'string' && opts[k].trim()) {
            const val = opts[k].trim();
            const lowerVal = val.toLowerCase();
            // SDD v1.9.76 / v1.9.177 / v1.9.305 (Escenario 324):
            // "Maduro" es la norma biológica y estándar por defecto de cualquier producto en FruFresco.
            // Queda estrictamente prohibido imprimir "Maduro" / "Madura" en la documentación operativa o sábana de alistamiento.
            if (lowerVal === 'maduro' || lowerVal === 'madura') {
                return;
            }
            if (!/^\\d+$/.test(val) && lowerVal !== 'estandar' && lowerVal !== 'estándar') {
                if (!isRedundantAttribute(val, prodName)) {
                    attributeParts.push(val);
                }
            }
        }
    });`;

// Normalize line endings for replacement
const normalizeEol = (str) => str.replace(/\r\n/g, "\n");
if (normalizeEol(orderUtils).includes(normalizeEol(targetOrderUtils))) {
  // Replace in whatever eol orderUtils uses
  orderUtils = normalizeEol(orderUtils).replace(
    normalizeEol(targetOrderUtils),
    normalizeEol(replacementOrderUtils)
  );
  fs.writeFileSync(orderUtilsPath, orderUtils, "utf8");
  console.log("Successfully patched src/lib/orderUtils.ts");
} else {
  console.log("targetOrderUtils not found in orderUtils.ts. Checking if already patched...");
  if (orderUtils.includes("lowerVal === 'maduro' || lowerVal === 'madura'")) {
    console.log("src/lib/orderUtils.ts is ALREADY patched!");
  } else {
    console.error("FAILED to find target in orderUtils.ts");
  }
}

// 2. Patch src/components/QuickViewModal.tsx
const qvPath = path.resolve(__dirname, "../src/components/QuickViewModal.tsx");
let qv = fs.readFileSync(qvPath, "utf8");

const targetQv = `                .reduce((acc: any, opt: any) => {
                    let values = opt.values || [];
                    return { ...acc, [opt.name]: values };
                }, {})
            : product.options || {};`;

const replacementQv = `                .reduce((acc: any, opt: any) => {
                    let values = opt.values || [];
                    // SDD v1.9.177 / v1.9.305 (Escenario 324): "Maduro" es el estándar implícito; se suprime de selectores
                    if (opt.name.toLowerCase().includes('madura')) {
                        values = values.filter((v: string) => {
                            const clean = (v.includes('|') ? v.split('|')[0] : v).toLowerCase().trim();
                            return clean !== 'maduro' && clean !== 'madura';
                        });
                    }
                    if (values.length === 0) return acc;
                    return { ...acc, [opt.name]: values };
                }, {})
            : (() => {
                const rawOpts = { ...(product.options || {}) };
                Object.keys(rawOpts).forEach(k => {
                    if (k.toLowerCase().includes('madura') && Array.isArray(rawOpts[k])) {
                        rawOpts[k] = rawOpts[k].filter((v: string) => {
                            const clean = (v.includes('|') ? v.split('|')[0] : v).toLowerCase().trim();
                            return clean !== 'maduro' && clean !== 'madura';
                        });
                        if (rawOpts[k].length === 0) delete rawOpts[k];
                    }
                });
                return rawOpts;
            })();`;

if (normalizeEol(qv).includes(normalizeEol(targetQv))) {
  qv = normalizeEol(qv).replace(
    normalizeEol(targetQv),
    normalizeEol(replacementQv)
  );
  fs.writeFileSync(qvPath, qv, "utf8");
  console.log("Successfully patched src/components/QuickViewModal.tsx");
} else {
  console.log("targetQv not found in QuickViewModal.tsx. Checking if already patched...");
  if (qv.includes("clean !== 'maduro' && clean !== 'madura'")) {
    console.log("src/components/QuickViewModal.tsx is ALREADY patched!");
  } else {
    console.error("FAILED to find target in QuickViewModal.tsx");
  }
}

// 3. Patch src/components/ProductDetailClient.tsx
const pdPath = path.resolve(__dirname, "../src/components/ProductDetailClient.tsx");
let pd = fs.readFileSync(pdPath, "utf8");

const targetPd = `        .reduce((acc: any, opt: any) => {
            let values = opt.values || [];
            return { ...acc, [opt.name]: values };
        }, {})
    : product.options || {};`;

const replacementPd = `        .reduce((acc: any, opt: any) => {
            let values = opt.values || [];
            // SDD v1.9.177 / v1.9.305 (Escenario 324): "Maduro" es el estándar implícito; se suprime de selectores
            if (opt.name.toLowerCase().includes('madura')) {
                values = values.filter((v: string) => {
                    const clean = (v.includes('|') ? v.split('|')[0] : v).toLowerCase().trim();
                    return clean !== 'maduro' && clean !== 'madura';
                });
            }
            if (values.length === 0) return acc;
            return { ...acc, [opt.name]: values };
        }, {})
    : (() => {
        const rawOpts = { ...(product.options || {}) };
        Object.keys(rawOpts).forEach(k => {
            if (k.toLowerCase().includes('madura') && Array.isArray(rawOpts[k])) {
                rawOpts[k] = rawOpts[k].filter((v: string) => {
                    const clean = (v.includes('|') ? v.split('|')[0] : v).toLowerCase().trim();
                    return clean !== 'maduro' && clean !== 'madura';
                });
                if (rawOpts[k].length === 0) delete rawOpts[k];
            }
        });
        return rawOpts;
    })();`;

if (normalizeEol(pd).includes(normalizeEol(targetPd))) {
  pd = normalizeEol(pd).replace(
    normalizeEol(targetPd),
    normalizeEol(replacementPd)
  );
  fs.writeFileSync(pdPath, pd, "utf8");
  console.log("Successfully patched src/components/ProductDetailClient.tsx");
} else {
  console.log("targetPd not found in ProductDetailClient.tsx. Checking if already patched...");
  if (pd.includes("clean !== 'maduro' && clean !== 'madura'")) {
    console.log("src/components/ProductDetailClient.tsx is ALREADY patched!");
  } else {
    console.error("FAILED to find target in ProductDetailClient.tsx");
  }
}
