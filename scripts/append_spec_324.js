const fs = require("fs");
const path = require("path");

const specPath = path.resolve(__dirname, "../SPEC.md");
let content = fs.readFileSync(specPath, "utf8");

const escenario324 = `
---

### Escenario 324: Erradicación Poka-Yoke de la Característica Redundante 'Maduro' en Selectores de Pedidos y Sábana de Alistamiento (Gemba Feedback Sábana: Hallazgo 4) (SDD v1.9.305)
- **Given** el reporte de la mesa de operaciones de bodega donde se evidenció que en la sábana de alistamiento nocturno continuaba apareciendo la palabra *"Maduro"* como nota de característica debajo de las cantidades (ej. \`COLSUBSIDIO - CATERING\` con \`20 KG / Maduro\`, \`Feedback_sabana_alistamiento.docx\`, Hallazgo 4), generando confusión entre los alistadores que interpretaban una solicitud atípica de sobremaduración inmediata,
- **When** se evalúa la regla agronómica de FruFresco frente al dogma del SDD (Deuda Técnica 15 y Escenarios 76, 79 y 177) donde todo producto de catálogo se despacha por defecto en maduración comercial estándar (*"Maduro"*):
- **Then** el sistema ratifica e impone los siguientes tres (3) estándares inviolables:
  1. **Prohibición Absoluta de 'Maduro' como Opción Seleccionable:**
     - En todos los canales de captura y montaje de pedidos (\`/admin/orders/create\`, \`EmailDraftsModule\`, catálogo web \`QuickViewModal\` y checkout B2B), queda terminantemente prohibido exponer *"Maduro"* o *"Madura"* como opción en selectores de maduración.
     - La condición madura es la línea base biológica implícita por contrato. Únicamente se parametrizan y exponen desviaciones agronómicas diferenciales requeridas expresamente por cocina: **\`Pintón\`**, **\`Verde\`**, **\`Biche\`** y **\`Listo para tajar\`**.
  2. **Supresión Canónica de Impresión en Documentación Operativa (\`formatStructuredSpecification\`):**
     - En el motor de especificaciones estructuradas (\`src/lib/orderUtils.ts\`) que alimenta la Sábana de Alistamiento (\`/admin/orders/alistamiento-print\`), remisiones y planillas de bodega, queda estrictamente vetada la emisión de la palabra *"Maduro"* o *"Madura"*.
     - Si un ítem histórico o externo arriba con \`selected_options.Maduración = "Maduro"\`, el atributo se suprime en silencio, garantizando que la celda se imprima limpia con su masa neta (\`20 KG\`) sin ruido visual.
  3. **Preservación Exclusiva de Notas Diferenciales y Físicas:**
     - Solo se imprimen en la píldora ámbar de alto contraste aquellas especificaciones culinarias que representan una desviación física verificable en muelle: puntos diferenciales (\`Pintón\`, \`Verde\`, \`Biche\`, \`Listo para tajar\`), cortes especiales (\`Juliana\`, \`Cubos\`) o desgloses de gramaje fraccionado (\`5 und de 500 gr\`).
`;

if (!content.includes("Escenario 324:")) {
  content += escenario324;
  fs.writeFileSync(specPath, content, "utf8");
  console.log("Escenario 324 successfully appended to SPEC.md");
} else {
  console.log("Escenario 324 already present in SPEC.md");
}
