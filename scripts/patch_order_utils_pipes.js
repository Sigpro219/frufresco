const fs = require("fs");
const path = require("path");

const filePath = path.resolve(__dirname, "../src/lib/orderUtils.ts");
let content = fs.readFileSync(filePath, "utf8");

const target = `    // 2. Extract valid culinary attributes (Maduración, Corte, Calibre, etc.)
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
    });

    // 2.1 Extraer y normalizar Nota de Alistamiento / Tamaño (Mapeo: Grande=Cero, Mediana=Mediana, Pequeño=Richy)
    const pickingKeys = ['Nota alistamiento', 'Nota de alistamiento', 'nota_alistamiento', 'Tamaño', 'Tamano', 'tamano', 'Size'];
    let foundPickingNote = false;
    for (const pk of pickingKeys) {
        if (opts[pk] && typeof opts[pk] === 'string' && opts[pk].trim()) {
            const rawVal = opts[pk].trim();
            const normalized = normalizePickingNote(rawVal);
            if (normalized && !isRedundantAttribute(normalized, prodName)) {
                if (!attributeParts.includes(normalized)) {
                    attributeParts.push(normalized);
                }
                foundPickingNote = true;
                break;
            }
        }
    }`;

const replacement = `    // 2. Extract valid culinary attributes (Maduración, Corte, Calibre, etc.)
    const knownKeys = ['Maduración', 'Maduracion', 'Corte', 'Calibre', 'Punto', 'Especificación', 'Especificacion'];
    knownKeys.forEach(k => {
        if (opts[k] && typeof opts[k] === 'string' && opts[k].trim()) {
            const val = opts[k].trim();
            const cleanVal = (val.includes('|') ? val.split('|')[0] : val).trim();
            const lowerClean = cleanVal.toLowerCase();
            // SDD v1.9.76 / v1.9.177 / v1.9.305 (Escenario 324):
            // "Maduro" es la norma biológica y estándar por defecto de cualquier producto en FruFresco.
            // Queda estrictamente prohibido imprimir "Maduro" / "Madura" en la documentación operativa o sábana de alistamiento.
            if (lowerClean === 'maduro' || lowerClean === 'madura') {
                return;
            }
            if (!/^\\d+$/.test(cleanVal) && lowerClean !== 'estandar' && lowerClean !== 'estándar') {
                if (!isRedundantAttribute(cleanVal, prodName)) {
                    attributeParts.push(cleanVal);
                }
            }
        }
    });

    // 2.1 Extraer y normalizar Nota de Alistamiento / Tamaño (Mapeo: Grande=Cero, Mediana=Mediana, Pequeño=Richy)
    const pickingKeys = ['Nota alistamiento', 'Nota de alistamiento', 'nota_alistamiento', 'Tamaño', 'Tamano', 'tamano', 'Size'];
    let foundPickingNote = false;
    for (const pk of pickingKeys) {
        if (opts[pk] && typeof opts[pk] === 'string' && opts[pk].trim()) {
            const rawVal = opts[pk].trim();
            const cleanRaw = (rawVal.includes('|') ? rawVal.split('|')[0] : rawVal).trim().toLowerCase();
            if (cleanRaw === 'maduro' || cleanRaw === 'madura') {
                continue;
            }
            const normalized = normalizePickingNote(rawVal);
            if (normalized) {
                const normLower = normalized.toLowerCase().trim();
                if (normLower === 'maduro' || normLower === 'madura') {
                    continue;
                }
                if (!isRedundantAttribute(normalized, prodName)) {
                    if (!attributeParts.includes(normalized)) {
                        attributeParts.push(normalized);
                    }
                    foundPickingNote = true;
                    break;
                }
            }
        }
    }`;

const normalizeEol = str => str.replace(/\r\n/g, "\n");
if (normalizeEol(content).includes(normalizeEol(target))) {
  content = normalizeEol(content).replace(normalizeEol(target), normalizeEol(replacement));
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Successfully patched src/lib/orderUtils.ts");
} else {
  console.error("Target not found in orderUtils.ts");
}
