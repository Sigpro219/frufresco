# REFACCIÓN DEL ARSENAL: Input Numérico Industrial Anti-Cero a la Izquierda y Soporte Dual de Coma/Punto Decimal (`,` / `.`)

> **ID de Refacción:** `REF-INPUT-NUMERICO-SIN-CERO-Y-COMA-DECIMAL`  
> **Categoría:** UI/UX Industrial • Formularios React/Next.js • Ergonomía de Captura Gemba  
> **Skills Vinculadas:** `disenador-web`, `cirujano-cambios-quirurgicos`

---

## 1. Problema Real en el Gemba (Baseline 1X)

En aplicaciones operativas de inventarios, báscula, pedidos B2B/B2C, notas crédito y auditoría PQRS, el uso tradicional de `<input type="number" value={qty} onChange={e => setQty(Number(e.target.value) || 0)} />` en React produce dos fricciones críticas reportadas reiteradamente por los usuarios:

1. **El Cero Pegado a la Izquierda (`05` / `50`):**
   - Cuando el usuario borra el número actual con `Backspace`, `e.target.value` pasa a `""`, el handler evalúa `Number("") || 0` y fuerza el estado a `0`.
   - React re-renderiza inmediatamente `"0"` dentro del input. Cuando el usuario escribe `2`, queda `"02"` o `"20"`.
2. **Rechazo de la Coma (`,`) como Separador Decimal:**
   - En Colombia y Latinoamérica los operadores usan indistintamente la coma (`1,5`) o el punto (`1.5`) en el teclado numérico.
   - En `<input type="number">`, el motor del navegador invalida `"1,"` y entrega `e.target.value === ""`, además de que `Number("1,5")` en JavaScript retorna `NaN`.

---

## 2. Solución Canónica 7X (Patrón Dual `type="text" inputMode="decimal"`)

### Reglas Innegociables
1. **Nunca usar `type="number"`** en inputs controlados de cantidades, pesos (`Kg`), porcentajes o montos editables. Usar siempre:
   ```tsx
   type="text"
   inputMode="decimal"
   ```
2. **Estado Dual (`rawInput` + `numericValue`):**
   - Mientras el usuario escribe, el input muestra la cadena exacta `rawInput` (permitiendo `""`, `"0,"`, `"1,5"`, `"2."`).
   - En paralelo se actualiza el valor numérico normalizando la coma a punto (`raw.replace(',', '.')`).
3. **Purga Automática de Ceros a la Izquierda:**
   - Expresión regular canónica: `raw = raw.replace(/^0+(?=\d)/, '');`
   - Si el campo tenía `"0"` y el usuario digita `"3"`, `"03"` se convierte instantáneamente en `"3"`.
   - Si el usuario escribe `"0,5"` o `"0.5"`, el lookahead `(?=\d)` respeta el cero porque el siguiente carácter es `,` o `.`.
4. **Autoselección en Foco (`onFocus`):**
   - `onFocus={e => e.currentTarget.select()}` para que al hacer clic o entrar con `TAB`, escribir cualquier cifra reemplace el valor anterior de inmediato.

---

## 3. Snippet Listo para Ensamble (Copy-Paste)

```tsx
// Estado (o propiedades dentro de un ítem de tabla)
const [qty, setQty] = useState<number>(0);
const [qtyInput, setQtyInput] = useState<string>('');

// Renderizado del Input
<input
    type="text"
    inputMode="decimal"
    placeholder="0"
    value={qtyInput !== '' ? qtyInput : (qty === 0 ? '' : String(qty))}
    onFocus={e => e.currentTarget.select()}
    onBlur={() => setQtyInput(qty > 0 ? String(qty) : '')}
    onChange={e => {
        // 1. Permitir solo dígitos, punto o coma
        let raw = e.target.value.replace(/[^0-9.,]/g, '');
        // 2. Garantizar máximo un separador decimal (. o ,)
        const firstSepIdx = raw.search(/[.,]/);
        if (firstSepIdx !== -1) {
            const prefix = raw.slice(0, firstSepIdx + 1);
            const rest = raw.slice(firstSepIdx + 1).replace(/[.,]/g, '');
            raw = prefix + rest;
        }
        // 3. Eliminar ceros a la izquierda antes de un dígito entero (ej: "05" -> "5", pero mantiene "0,5")
        raw = raw.replace(/^0+(?=\d)/, '');
        setQtyInput(raw);

        // 4. Convertir a número normalizando coma a punto
        const normalized = raw.replace(',', '.');
        const parsed = normalized === '' || normalized === '.' ? 0 : Number(normalized);
        if (!Number.isNaN(parsed)) {
            setQty(Math.max(0, parsed));
        }
    }}
/>
```
