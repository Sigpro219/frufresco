const fs = require("fs");
const path = require("path");

const specPath = path.resolve(__dirname, "../SPEC.md");
let content = fs.readFileSync(specPath, "utf8");

// Escenario 323 text
const escenario323 = `
---

### Escenario 323: Ratificación Canónica y Blindaje Anti-Doble-Conversión Dual-Unit en Gramajes de Sábana de Alistamiento (Gemba Feedback Sábana: Hallazgo 3) (SDD v1.9.304)
- **Given** el reporte de la mesa de operaciones de bodega donde se evidenció una discrepancia en el cálculo de kilogramos al imprimir presentaciones de gramaje fraccionado (ej. *"5 Unidades de 500g"* figuraban como \`1,25 KG\` para BATEA S.A.S. en lugar de los \`2,5 KG\` matemáticos reales, mientras que para BARUS SAS *"20 und de 500 gr"* calculaban correctamente \`10 KG\`, \`Feedback_sabana_alistamiento.docx\`, Hallazgo 3),
- **When** se audita forensemente la base de datos histórica y el motor de normalización en \`/admin/orders/alistamiento-print\`:
- **Then** el sistema ratifica e impone las siguientes tres (3) certezas de arquitectura:
  1. **Evidencia Forense de Causa Raíz en BD:**
     - La captura del reporte físico correspondió al pedido histórico #1041 de BATEA S.A.S. (del 08 de octubre de 2026), el cual fue almacenado en \`order_items\` con \`quantity = 2.5\` y \`unit = 'Kg'\`, pero con metadatos heredados en texto \`selected_options: { Presentación: 'Unidad 500 gr' }\` y \`variant_label: 'und de 500 gr'\` sin los campos estructurados del Dual-Unit Engine (\`_original_qty\`, \`_unit_weight_gr\`).
     - En contraste, el pedido #1040 de BARUS SAS sí contenía \`_original_qty: 20\`, por lo que el motor dual-unit calculó directamente \`20 * 0.5 = 10 KG\`.
  2. **Ratificación de la Corrección Preventiva (Commit 75d9fa84 / Escenario 282):**
     - La causa raíz del fallo en Batea radicaba en que versiones previas a la actualización del viernes 23 de octubre re-multiplicaban la cantidad por el peso unitario (\`2.5 * 0.5 = 1.25 KG\`) al detectar la palabra \`"und"\` en la etiqueta de presentación, ignorando que el ítem ya se encontraba expresado en kilogramos (\`unit === 'Kg'\`).
     - Dicha anomalía quedó resuelta mediante el guardrail \`isRawAlreadyKg\`, el cual prohíbe re-multiplicar cuando \`rawUnit\` ya es \`'kg'\`, \`'kilo'\` o \`'kilogramo'\`, garantizando que \`effectiveKg = quantity\` (\`2,5 KG\`).
  3. **Certificación de Ejecución Vigente:**
     - El pedido #1241 de BATEA S.A.S. y cualquier pedido posterior con ítems en kilogramos y especificaciones de presentación fraccionada evalúan estrictamente a su masa neta real (\`2,5 KG\`), y la especificación complementaria en píldora Lean muestra de forma transparente \`5 und de 500 gr\`, erradicando discrepancias de pesaje en las células de alistamiento.
`;

// Append Escenario 323
if (!content.includes("Escenario 323:")) {
  content += escenario323;
  fs.writeFileSync(specPath, content, "utf8");
  console.log("Escenario 323 successfully appended to SPEC.md");
} else {
  console.log("Escenario 323 already present in SPEC.md");
}
