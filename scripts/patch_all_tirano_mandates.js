const fs = require("fs");
const path = require("path");

const normalizeEol = str => str.replace(/\r\n/g, "\n");

// 1. Patch src/app/admin/orders/create/page.tsx
const createPath = path.resolve(__dirname, "../src/app/admin/orders/create/page.tsx");
let createContent = fs.readFileSync(createPath, "utf8");

// A. Line 1120
const targetA = `            // SDD v1.9.177: 'Maduro' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
            Object.keys(initialOptions).forEach(k => {
                if (k.toLowerCase().includes('madura') && String(initialOptions[k]).toLowerCase().trim() === 'maduro') {
                    delete initialOptions[k];
                }
            });`;

const replA = `            // SDD v1.9.177 / v1.9.305 (Escenario 324): 'Maduro'/'Madura' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
            Object.keys(initialOptions).forEach(k => {
                const cleanK = (String(initialOptions[k]).includes('|') ? String(initialOptions[k]).split('|')[0] : String(initialOptions[k])).toLowerCase().trim();
                if (k.toLowerCase().includes('madura') && (cleanK === 'maduro' || cleanK === 'madura')) {
                    delete initialOptions[k];
                }
            });`;

// B. Line 1830 & Line 1840
const targetB = `                    const matchedVal = opt.values.find((val: string) => {
                        const vClean = (val.includes('|') ? val.split('|')[0] : val).trim().toLowerCase();
                        if (vClean === 'maduro') return false; // SDD v1.9.177: Maduro nunca se preselecciona
                        return noteClean.includes(vClean) || vClean.includes(noteClean);
                    });
                    if (matchedVal) {
                        initialOptions[opt.name] = matchedVal;
                    }
                }
            });
        }
        // SDD v1.9.177: 'Maduro' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
        Object.keys(initialOptions).forEach(k => {
            if (k.toLowerCase().includes('madura') && String(initialOptions[k]).toLowerCase().trim() === 'maduro') {
                delete initialOptions[k];
            }
        });`;

const replB = `                    const matchedVal = opt.values.find((val: string) => {
                        const vClean = (val.includes('|') ? val.split('|')[0] : val).trim().toLowerCase();
                        if (vClean === 'maduro' || vClean === 'madura') return false; // SDD v1.9.177 / v1.9.305: Maduro nunca se preselecciona
                        return noteClean.includes(vClean) || vClean.includes(noteClean);
                    });
                    if (matchedVal) {
                        initialOptions[opt.name] = matchedVal;
                    }
                }
            });
        }
        // SDD v1.9.177 / v1.9.305: 'Maduro'/'Madura' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
        Object.keys(initialOptions).forEach(k => {
            const cleanK = (String(initialOptions[k]).includes('|') ? String(initialOptions[k]).split('|')[0] : String(initialOptions[k])).toLowerCase().trim();
            if (k.toLowerCase().includes('madura') && (cleanK === 'maduro' || cleanK === 'madura')) {
                delete initialOptions[k];
            }
        });`;

// C. Line 2406 (openProductModal)
const targetC = `        // Auto-match picking note to options (ej. Nota: "Pintón" -> Maduración: "Pintón")
        if (exc && exc.picking_note) {
            const noteClean = exc.picking_note.trim().toLowerCase();
            (product.options_config || []).forEach((opt: any) => {
                if (!mergedOptions[opt.name] && Array.isArray(opt.values)) {
                    const matchedVal = opt.values.find((val: string) => {
                        const vClean = (val.includes('|') ? val.split('|')[0] : val).trim().toLowerCase();
                        return noteClean.includes(vClean) || vClean.includes(noteClean);
                    });
                    if (matchedVal) {
                        mergedOptions[opt.name] = matchedVal;
                    }
                }
            });
        }
        setSelectedOptions(mergedOptions);`;

const replC = `        // Auto-match picking note to options (ej. Nota: "Pintón" -> Maduración: "Pintón")
        if (exc && exc.picking_note) {
            const noteClean = exc.picking_note.trim().toLowerCase();
            (product.options_config || []).forEach((opt: any) => {
                if (!mergedOptions[opt.name] && Array.isArray(opt.values)) {
                    const matchedVal = opt.values.find((val: string) => {
                        const vClean = (val.includes('|') ? val.split('|')[0] : val).trim().toLowerCase();
                        if (vClean === 'maduro' || vClean === 'madura') return false; // SDD v1.9.177 / v1.9.305
                        return noteClean.includes(vClean) || vClean.includes(noteClean);
                    });
                    if (matchedVal) {
                        mergedOptions[opt.name] = matchedVal;
                    }
                }
            });
        }
        // SDD v1.9.177 / v1.9.305: 'Maduro'/'Madura' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
        Object.keys(mergedOptions).forEach(k => {
            const cleanK = (String(mergedOptions[k]).includes('|') ? String(mergedOptions[k]).split('|')[0] : String(mergedOptions[k])).toLowerCase().trim();
            if (k.toLowerCase().includes('madura') && (cleanK === 'maduro' || cleanK === 'madura')) {
                delete mergedOptions[k];
            }
        });
        setSelectedOptions(mergedOptions);`;

// D. Line 10425
const targetD = `                    // SDD v1.9.177: Retiro canónico de "Maduro" en toma de pedidos B2B
                    const isRipeness = opt.name.toLowerCase().includes('madura');
                    if (isRipeness) {
                        values = values.filter((v: string) => v.toLowerCase().trim() !== 'maduro');
                    }`;

const replD = `                    // SDD v1.9.177 / v1.9.305: Retiro canónico de "Maduro" y "Madura" en toma de pedidos B2B
                    const isRipeness = opt.name.toLowerCase().includes('madura');
                    if (isRipeness) {
                        values = values.filter((v: string) => {
                            const clean = (v.includes('|') ? v.split('|')[0] : v).toLowerCase().trim();
                            return clean !== 'maduro' && clean !== 'madura';
                        });
                    }`;

let normCreate = normalizeEol(createContent);
normCreate = normCreate.replace(normalizeEol(targetA), normalizeEol(replA));
normCreate = normCreate.replace(normalizeEol(targetB), normalizeEol(replB));
normCreate = normCreate.replace(normalizeEol(targetC), normalizeEol(replC));
normCreate = normCreate.replace(normalizeEol(targetD), normalizeEol(replD));
fs.writeFileSync(createPath, normCreate, "utf8");
console.log("Patched src/app/admin/orders/create/page.tsx");

// 2. Patch src/components/EmailDraftsModule.tsx
const emailPath = path.resolve(__dirname, "../src/components/EmailDraftsModule.tsx");
let emailContent = fs.readFileSync(emailPath, "utf8");

// A. Line 2243
const targetEA = `    // SDD v1.9.177: 'Maduro' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
    Object.keys(opts).forEach(k => {
      if (k.toLowerCase().includes('madura') && String(opts[k]).toLowerCase().trim() === 'maduro') {
        delete opts[k];
      }
    });`;

const replEA = `    // SDD v1.9.177 / v1.9.305 (Escenario 324): 'Maduro'/'Madura' es la maduración implícita por defecto; nunca se preselecciona ni se persiste como variante
    Object.keys(opts).forEach(k => {
      const cleanK = (String(opts[k]).includes('|') ? String(opts[k]).split('|')[0] : String(opts[k])).toLowerCase().trim();
      if (k.toLowerCase().includes('madura') && (cleanK === 'maduro' || cleanK === 'madura')) {
        delete opts[k];
      }
    });`;

// B. Line 11203
const targetEB = `                        const cleanVal = v.trim().toLowerCase();
                        const cleanKey = k.trim().toLowerCase();
                        if (cleanVal === 'estandar' || cleanVal === 'estándar') return false;
                        if (cleanKey.includes('madura') && cleanVal === 'maduro') return false;`;

const replEB = `                        const cleanVal = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
                        const cleanKey = k.trim().toLowerCase();
                        if (cleanVal === 'estandar' || cleanVal === 'estándar') return false;
                        if (cleanKey.includes('madura') && (cleanVal === 'maduro' || cleanVal === 'madura')) return false;`;

// C. Line 11883
const targetEC = `                  // SDD v1.9.177: Retiro canónico de "Maduro" en toma de pedidos B2B
                  const isRipeness = (opt.name || '').toLowerCase().includes('madura');
                  if (isRipeness) {
                    const filteredValues = (opt.values || []).filter((v: string) => v.toLowerCase().trim() !== 'maduro');
                    return { ...opt, values: filteredValues };
                  }`;

const replEC = `                  // SDD v1.9.177 / v1.9.305 (Escenario 324): Retiro canónico de "Maduro" y "Madura" en toma de pedidos B2B
                  const isRipeness = (opt.name || '').toLowerCase().includes('madura');
                  if (isRipeness) {
                    const filteredValues = (opt.values || []).filter((v: string) => {
                      const clean = (v.includes('|') ? v.split('|')[0] : v).toLowerCase().trim();
                      return clean !== 'maduro' && clean !== 'madura';
                    });
                    return { ...opt, values: filteredValues };
                  }`;

let normEmail = normalizeEol(emailContent);
normEmail = normEmail.replace(normalizeEol(targetEA), normalizeEol(replEA));
normEmail = normEmail.replace(normalizeEol(targetEB), normalizeEol(replEB));
normEmail = normEmail.replace(normalizeEol(targetEC), normalizeEol(replEC));
fs.writeFileSync(emailPath, normEmail, "utf8");
console.log("Patched src/components/EmailDraftsModule.tsx");

// 3. Update SPEC.md with Escenario 324 RFC Amendment
const specPath = path.resolve(__dirname, "../SPEC.md");
let specContent = fs.readFileSync(specPath, "utf8");

const oldSpecPart = `  1. **Prohibición Absoluta de 'Maduro' como Opción Seleccionable:**
     - En todos los canales de captura y montaje de pedidos (\`/admin/orders/create\`, \`EmailDraftsModule\`, catálogo web \`QuickViewModal\` y checkout B2B), queda terminantemente prohibido exponer *"Maduro"* o *"Madura"* como opción en selectores de maduración.
     - La condición madura es la línea base biológica implícita por contrato. Únicamente se parametrizan y exponen desviaciones agronómicas diferenciales requeridas expresamente por cocina: **\`Pintón\`**, **\`Verde\`**, **\`Biche\`** y **\`Listo para tajar\`**.
  2. **Supresión Canónica de Impresión en Documentación Operativa (\`formatStructuredSpecification\`):**
     - En el motor de especificaciones estructuradas (\`src/lib/orderUtils.ts\`) que alimenta la Sábana de Alistamiento (\`/admin/orders/alistamiento-print\`), remisiones y planillas de bodega, queda estrictamente vetada la emisión de la palabra *"Maduro"* o *"Madura"*.
     - Si un ítem histórico o externo arriba con \`selected_options.Maduración = "Maduro"\`, el atributo se suprime en silencio, garantizando que la celda se imprima limpia con su masa neta (\`20 KG\`) sin ruido visual.`;

const newSpecPart = `  1. **Prohibición Absoluta de 'Maduro' y 'Madura' como Opción Seleccionable:**
     - En todos los canales de captura y montaje de pedidos (\`/admin/orders/create\`, \`EmailDraftsModule\`, catálogo web \`QuickViewModal\` y checkout B2B), queda terminantemente prohibido exponer *"Maduro"* o *"Madura"* como opción en selectores de maduración.
     - El filtrado de opciones normaliza rigurosamente valores compuestos por tuberías (\`value.split('|')[0]\`) y erradica de forma insensible a mayúsculas/minúsculas tanto *"maduro"* como *"madura"*.
     - La condición madura es la línea base biológica implícita por contrato. Únicamente se parametrizan y exponen desviaciones agronómicas diferenciales requeridas expresamente por cocina: **\`Pintón\`**, **\`Verde\`**, **\`Biche\`** y **\`Listo para tajar\`**.
  2. **Supresión Canónica de Impresión en Documentación Operativa (\`formatStructuredSpecification\`):**
     - En el motor de especificaciones estructuradas (\`src/lib/orderUtils.ts\`) que alimenta la Sábana de Alistamiento (\`/admin/orders/alistamiento-print\`), remisiones y planillas de bodega, queda estrictamente vetada la emisión de la palabra *"Maduro"* o *"Madura"*.
     - La supresión en \`formatStructuredSpecification\` aplica sobre cualquier llave agronómica o de alistamiento (\`Maduración\`, \`Punto\`, \`Nota alistamiento\`, etc.), despojando sufijos técnicos (\`|\`) y depurando la entrada de notas informales.
     - Si un ítem histórico o externo arriba con \`selected_options.Maduración = "Maduro"\`, el atributo se suprime en silencio, garantizando que la celda se imprima limpia con su masa neta (\`20 KG\`) sin ruido visual.`;

let normSpec = normalizeEol(specContent);
if (normSpec.includes(normalizeEol(oldSpecPart))) {
  normSpec = normSpec.replace(normalizeEol(oldSpecPart), normalizeEol(newSpecPart));
  fs.writeFileSync(specPath, normSpec, "utf8");
  console.log("Updated SPEC.md Escenario 324 with RFC amendment");
}
