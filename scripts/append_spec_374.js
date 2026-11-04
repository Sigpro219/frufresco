const fs = require('fs');

const specPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let specContent = fs.readFileSync(specPath, 'utf8');

const escenario374 = `

---

### Escenario 374: Gobernanza del Flujo Manual de Inventarios, Mapeo Canónico de las 24 Columnas y Disparador de Ventas por Lanzamiento Operativo (\`/admin/commercial/inventory\`) (SDD v1.9.358)

#### 1. Contexto Operativo y Realidad del Gemba FruFresco
En la operación diaria de FruFresco, la **Sábana Oficial de Balance Diario de 24 Columnas** (\`src/components/InventoryDailyBalanceTab.tsx\`) constituye la herramienta rectora del balance de masa físico y contable. Cada kilogramo de producto perecedero y abarrotes que entra, sale o se merma en bodega debe cuadrar de forma exacta bajo la **Ecuación Canónica de Conservación de Masa**:
$$\\mathbf{S} = \\mathbf{E} + \\mathbf{F} + \\mathbf{G} - \\mathbf{H} - \\mathbf{J} - \\mathbf{K} + \\mathbf{L} - \\mathbf{M} - \\mathbf{N} + \\mathbf{O} - \\mathbf{P} - \\mathbf{Q} - \\mathbf{R}$$

Para garantizar el control total de los supervisores y jefes de inventario antes de depender de sincronizaciones automáticas ciegas, el sistema consagra una fase de **verificación y operación manual guiada**, donde el usuario puede auditar y cargar directamente la información columna por columna.

#### 2. El Disparador Canónico de Venta (Trigger por Lanzamiento de Tanda)
1. **Punto de No Retorno Comercial como Disparador:**
   - En el módulo de Cargue de Pedidos (\`/admin/orders/loading\`), al confirmar el envío de la tanda a compras y bodega mediante el botón *«Confirmar y Enviar a Operación»*, los pedidos transicionan irrevocablemente a estado \`para_compra\`.
   - Este evento constituye el **trigger oficial vinculante** de la demanda comercial para la fecha de entrega respectiva (\`delivery_date = balanceDate\`).
2. **Consolidación en Tiempo Real por SKU:**
   - La totalidad de ítems demandados (\`order_items\`) se consolida por producto (ej. toda la papaya maradol, todos los melones, todas las cebollas):
     - **Columna H (\`colH_salesKg\`):** Recibe la sumatoria en kilogramos de los productos tarifados por peso ($-\\text{Kg}$).
     - **Columna I (\`colI_salesUnits\`):** Recibe la sumatoria de piezas para productos comercializados en unidades, atados, paquetes o bandejas (informativo visual).
     - **Columna J (\`colJ_weightSalesUnits\`):** Recibe el peso equivalente en kilogramos de dichas unidades (calculado mediante $\\sum \\text{unidades} \\times \\text{weight\\_kg}$ o pesaje de báscula) para restar masa físicamente homogénea en el balance en kilogramos ($-\\text{Kg}$).
3. **Impacto Inmediato en el Balance:**
   - Al registrarse la venta, la **Columna S (Inventario Calculado)** descuenta de inmediato la demanda comercial, permitiendo a la Torre de Control y a Compras visualizar el faltante exacto a abastecer en Corabastos frente al inventario inicial (Columna E).

#### 3. Especificación del Flujo de Carga Manual Celda a Celda (Excel-Native UX)
1. **Conmutador de Modo:**
   - La barra de herramientas superior dispone del botón **\`[ Modo Edición ]\`**. Al activarse, las columnas transaccionales (\`F, G, H, I, J, K, L, M, N, O, P, Q, R, T, X\`) se transforman en celdas de entrada numérica con foco visual destacado.
2. **Ergonomía de Teclado Fluida (0ms de latencia):**
   - **Enter:** Confirma el valor actual, guarda asíncronamente y desplaza el foco a la celda inferior (misma columna, siguiente fila).
   - **Shift + Enter:** Confirma y navega a la celda inmediatamente superior.
   - **Tab:** Confirma y navega a la siguiente columna editable de la fila. Si alcanza la última columna editable (\`X\`), realiza salto de línea envolvente hacia la primera columna editable (\`F\`) de la siguiente fila.
   - **Evaluador de Fórmulas Aritméticas:** Soporta la digitación de expresiones matemáticas directas (ej: \`=15+2.5*3\` o \`=100-20\`), evaluándolas al vuelo antes de persistir.
3. **Persistencia Optimista y Auditoría en Kardex (\`inventory_movements\`):**
   - Cada edición ejecuta \`persistCellChange\`:
     - Realiza una mutación optimista en memoria para que los totales de la fila, el Inventario Calculado ($S$), los Faltantes ($V$), los Sobrantes ($W$) y la fila de totales global se recalculen en 0ms.
     - Persiste atómicamente en PostgreSQL/Supabase en la tabla \`inventory_movements\` con la firma del usuario responsable (\`[AJUSTE AUTORIZADO - {nombre}] Columna {letra}: {valor}\`).
     - Si el valor se borra o se establece en \`0\`, purga el movimiento huérfano para mantener la base de datos limpia.

#### 4. Carga Masiva Alternativa vía Digestor Excel (\`DailyBalanceExcelImportModal.tsx\`)
- Permite importar de forma consolidada balances diarios generados por el ERP contable mediante archivos \`.xlsx\`.
- **Filtro Anti-Subtotales Poka-Yoke (Escenario 356):** Descarta filas resaltadas con amarillo (\`FFFF00\`) correspondientes a subtotales o agrupaciones contables para blindar la base contra la doble imputación de inventario.
- Mapea en $O(1)$ por código contable (\`accounting_id\`) e inyecta transacciones en lotes controlados de 200 filas.

#### 5. Criterios de Aceptación y Verificación
- [x] El botón \`[ Modo Edición ]\` habilita las celdas de las columnas H (Venta Kg), I (Venta Und) y J (Peso Venta Und) para pruebas manuales libres del usuario.
- [x] La digitación de ventas en las columnas H y J descuenta matemáticamente del cálculo de masa en la Columna S.
- [x] Al ingresar un valor y presionar \`Enter\`, el foco baja automáticamente a la siguiente fila sin pérdida de datos ni recarga de página.
- [x] Los cambios manuales quedan respaldados con firma de auditoría en la tabla \`inventory_movements\`.
`;

specContent += escenario374;
fs.writeFileSync(specPath, specContent, 'utf8');
console.log('Escenario 374 added successfully to SPEC.md');
