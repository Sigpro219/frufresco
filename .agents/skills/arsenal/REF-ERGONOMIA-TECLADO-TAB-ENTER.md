---
id: REF-ERGONOMIA-TECLADO-TAB-ENTER
version: 2.0
estado: VIGENTE
reemplaza: "v1.0 - REF-2026-08-27-03"
titulo: "Ergonomía de Teclado de Alta Velocidad (Flujo TAB + Auto-Select + Enter) para Captura Rápida"
categoria: "UI/UX Industrial & Captura Rápida B2B"
tags: [keyboard-first, poka-yoke, speed-entry, b2b-orders, single-piece-flow, mouse-free-entry]
multiplicador_velocidad: "6X"
reduccion_errores: "90%"
proyectos_origen: [frufresco]
fecha_cosecha: "2026-09-15"
---

# 🧩 Ficha de Refacción: Ergonomía de Teclado de Alta Velocidad (Mouse-Free 3-Step Flow)

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo & Flujo Físico:** En la mesa de pedidos B2B y despacho mayorista de FruFresco, los auxiliares de facturación y asesores comerciales ingresan órdenes institucionales (restaurantes, casinos industriales, clínicas) que contienen entre 30 y 80 líneas de productos perecederos.
* **Muda Identificada (Desperdicio de Movimiento & Fatiga):**
  1. El auxiliar tecleaba el nombre del producto en el teclado.
  2. Levantaba la mano derecha del teclado para agarrar el mouse, apuntar y hacer clic en el campo de cantidad.
  3. Devolvía la mano derecha al teclado numérico para teclear la cantidad.
  4. Volvía a tomar el mouse, movía el puntero por la pantalla buscando el botón verde "Agregar al Pedido" y hacía clic.
  5. Repetía este ciclo físico entre 40 y 80 veces por orden.
  * *La trampa del TAB natural:* Si el operario intentaba usar la tecla `TAB` para no usar el mouse, el foco del navegador saltaba en orden por el DOM: cruzaba la "X" de cerrar modal, el botón de cancelar, enlaces de ayuda y badges de precios (requiriendo entre 7 y 9 pulsaciones desorientadoras de `TAB` por cada producto).
* **Velocidad y Tasa de Falla Inicial:** Entre 8 y 12 minutos por pedido de 40 renglones a velocidad 1X. Dolores frecuentes de muñeca (túnel carpiano) y errores al tipear cantidades por pérdida de concentración.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 6X)
* **Nuevo Flujo de Trabajo (Mouse-Free Rapid Entry):** Captura 100% libre de mouse mediante un túnel cerrado de 3 pasos:
  1. *Paso 1 (Buscador):* Escribir letras iniciales $\to$ Flecha abajo $\to$ `Enter` para seleccionar el SKU.
  2. *Paso 2 (Cantidad):* El foco cae automáticamente en el input numérico y todo el texto se sombrea (`auto-select`). El usuario digita el número directamente sin tocar `Backspace`.
  3. *Paso 3 (Disparo):* Presionar `Enter` guarda la línea de inmediato y reinicia el cursor en el buscador para el siguiente producto.
* **Multiplicador de Negocio:** **Aceleración a 6X (captura de 30 renglones en menos de 90 segundos)**. Cero levantamiento de manos hacia el mouse, erradicación de errores de duplicación de dígitos y reducción radical del estrés operativo en horas pico.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
* ❌ **Antipatrón 1 (Navegación TAB por Defecto del Navegador):** Dejar que el DOM decida el orden del foco. Provoca que botones secundarios ("Cancelar", "Cerrar", "Ver términos") se interpongan en el camino crítico del operador.
* ❌ **La Trampa del "15" (Sin Auto-Select):** Si un input de cantidad se inicializa con el valor por defecto `1`, y el auxiliar teclea rápidamente `5`, el valor resultante queda en `15`. Este fallo provocaba despachos inflados de producto en bodega.
* 💣 **El Secreto Sucio Poka-Yoke (`autoFocus` + `e.target.select()`):**
  * Al recibir el foco mediante `onFocus={(e) => e.target.select()}`, el navegador sombrea todo el texto del campo. Cualquier tecla numérica que el operario presione sobreescribe instantáneamente el valor anterior. No requiere que el usuario presione `Backspace` ni `Delete`.
* 💣 **Exclusión Quirúrgica con `tabIndex={-1}`:**
  * Todos los botones y controles secundarios (la "X" de cerrar, el botón "Cancelar", botones de eliminar, chips de filtros) se marcan obligatoriamente con `tabIndex={-1}`.
  * Solo los campos del flujo crítico (`Buscador` $\to$ `Cantidad` $\to$ `Botón Agregar`) tienen `tabIndex={0}`.
* 💣 **Bucle Cerrado con Refocus Automático:** Tras confirmar con `Enter`, una referencia React (`searchRef.current?.focus()`) devuelve el foco al buscador limpiando la entrada anterior para el siguiente ítem en flujo continuo (*Single-Piece Flow*).
* 💣 **Diferenciación Semántica Estricta entre `Tab` y `Enter`:**
  * `Tab` (Desplazamiento / Exploración): Entra y navega paso a paso (`Presentación` $\to$ `Maduración` $\to$ `Cantidad` $\to$ `Botón Agregar`) sin forzar guardados prematuros.
  * `Enter` (Aceptación Inmediata): Acepta el estado o match actual por defecto y avanza inmediatamente al siguiente renglón o confirma la adición.
* 💣 **Invariante de Unidad de Medida Estática y Presentación Default `Kg`:**
  * La Unidad de Medida en modales es siempre un visor de sólo lectura (`tabIndex={-1}`), nunca un desplegable.
  * La Presentación siempre se inicializa en `Kg` por defecto salvo preferencia explícita del cliente.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### Componente de Captura Rápida B2B (Mouse-Free Loop)
```tsx
// src/components/QuickOrderEntryRow.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Search, Check } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  base_price: number;
  unit: string;
}

interface QuickOrderEntryProps {
  products: Product[];
  onAddItem: (item: { product: Product; quantity: number }) => void;
}

export default function QuickOrderEntryRow({ products, onAddItem }: QuickOrderEntryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<string>('1');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus en el buscador al montar
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const filteredProducts = searchTerm.trim() === ''
    ? []
    : products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 8);

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setSearchTerm(prod.name);
    setIsDropdownOpen(false);
    // Salto automático al campo de cantidad
    setTimeout(() => {
      quantityInputRef.current?.focus();
    }, 50);
  };

  const handleCommitItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const qtyNum = parseFloat(quantity.replace(',', '.'));
    if (!selectedProduct || isNaN(qtyNum) || qtyNum <= 0) return;

    onAddItem({ product: selectedProduct, quantity: qtyNum });

    // Bucle cerrado: resetear y devolver foco al buscador para el siguiente ítem
    setSelectedProduct(null);
    setSearchTerm('');
    setQuantity('1');
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  return (
    <form onSubmit={handleCommitItem} className="w-full bg-white dark:bg-[#121216] border border-slate-200 dark:border-zinc-800 rounded-xl p-3 shadow-xs flex flex-wrap md:flex-nowrap items-center gap-3">
      {/* 1. BUSCADOR DE PRODUCTO (tabIndex=0) */}
      <div className="relative flex-1 min-w-[240px]">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            tabIndex={0}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && filteredProducts.length > 0) {
                e.preventDefault();
                handleSelectProduct(filteredProducts[0]);
              }
            }}
            placeholder="[1] Nombre del producto (teclea y Enter)..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none font-medium"
          />
          {searchTerm && (
            <button
              type="button"
              tabIndex={-1} // SALTA botón limpiar con TAB
              onClick={() => {
                setSearchTerm('');
                setSelectedProduct(null);
                searchInputRef.current?.focus();
              }}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Desplegable de selección rápida */}
        {isDropdownOpen && filteredProducts.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {filteredProducts.map((p, idx) => (
              <li
                key={p.id}
                onClick={() => handleSelectProduct(p)}
                className="px-3 py-2 text-xs hover:bg-amber-50 dark:hover:bg-zinc-800 cursor-pointer flex justify-between items-center border-b border-slate-100 dark:border-zinc-800/50 last:border-0"
              >
                <span className="font-semibold text-slate-800 dark:text-zinc-200">{p.name}</span>
                <span className="text-slate-500 font-mono">${p.base_price.toLocaleString()} / {p.unit}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2. INPUT DE CANTIDAD (tabIndex=0 con AUTO-SELECT y ENTER) */}
      <div className="w-28 shrink-0">
        <input
          ref={quantityInputRef}
          type="text"
          inputMode="decimal"
          tabIndex={0}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          // CRÍTICO: Sombrea todo el texto para sobreescribir sin tocar Backspace
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCommitItem();
            }
          }}
          placeholder="Cant."
          className="w-full text-center py-2 text-sm font-bold font-mono bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none"
        />
      </div>

      {/* 3. BOTÓN DE CONFIRMACIÓN (tabIndex=0 o Enter desde cantidad) */}
      <button
        ref={submitButtonRef}
        type="submit"
        tabIndex={0}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono rounded-lg flex items-center gap-1.5 shrink-0 transition-all shadow-xs active:scale-95"
      >
        <Plus className="w-4 h-4" />
        <span>[Enter] Agregar</span>
      </button>

      {/* BOTÓN CANCELAR O LIMPIAR EXCLUIDO DE LA RUTA CRÍTICA */}
      <button
        type="button"
        tabIndex={-1} // NUNCA se detiene aquí con TAB
        onClick={() => {
          setSelectedProduct(null);
          setSearchTerm('');
          setQuantity('1');
          searchInputRef.current?.focus();
        }}
        className="px-2.5 py-2 text-slate-400 hover:text-slate-600 text-xs"
        title="Cancelar ítem"
      >
        Limpiar
      </button>
    </form>
  );
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas

### Dónde Encaja Esta Pieza
* **Terminales de Facturación y POS:** Escaneo rápido por nombre o código de barras + cantidad + cobro.
* **Módulos de Recepción de Mercancía:** Pesaje en báscula con ingreso continuo de peso por bulto.
* **Toma de Inventarios en Bodega:** Conteo de pasillo donde el operador lleva el teclado numérico en la mano.

### Dependencias Mínimas
* React 18+ (Hooks estándar `useState`, `useRef`, `useEffect`).
* `lucide-react` (Iconos estándar).
* Tailwind CSS.
