const fs = require("fs");
const path = require("path");

const pdPath = path.resolve(__dirname, "../src/components/ProductDetailClient.tsx");
let pd = fs.readFileSync(pdPath, "utf8");

const targetPd = `            .reduce((acc: any, opt: any) => {
                let values = opt.values || [];
                return { ...acc, [opt.name]: values };
            }, {})
        : product.options || {};`;

const replacementPd = `            .reduce((acc: any, opt: any) => {
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

const normalizeEol = (str) => str.replace(/\r\n/g, "\n");
if (normalizeEol(pd).includes(normalizeEol(targetPd))) {
  pd = normalizeEol(pd).replace(
    normalizeEol(targetPd),
    normalizeEol(replacementPd)
  );
  fs.writeFileSync(pdPath, pd, "utf8");
  console.log("Successfully patched src/components/ProductDetailClient.tsx");
} else {
  console.error("FAILED to find targetPd in ProductDetailClient.tsx");
}
