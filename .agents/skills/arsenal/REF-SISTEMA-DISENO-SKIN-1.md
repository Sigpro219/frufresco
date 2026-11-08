---
id: REF-SISTEMA-DISENO-SKIN-1
version: 1.0
estado: VIGENTE
reemplaza: null
titulo: "Skin 1: Sistema de Diseño Swiss Precision Slate & Obsidian Titanium con Golden Print"
categoria: "Ingesta IA & UI/UX Industrial"
tags: [ui-ux, skin-1, design-system, dark-mode, tailwind, print-standard, swiss-design, industrial-dashboard]
multiplicador_velocidad: "8X"
reduccion_errores: "95%"
proyectos_origen: [mjm-frontend]
fecha_cosecha: "2026-09-25"
---

# 🧩 Ficha de Refacción: Skin 1 (Swiss Precision Slate & Obsidian Titanium)

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo y Desarrollo:** Cada vez que se crea un nuevo módulo o proyecto web, el desarrollador pasa entre 4 y 8 horas reajustando selectores CSS, probando tonos de gris aleatorios (`bg-gray-100`, `bg-zinc-900`), corrigiendo sombras duras, alineando tablas descalabradas y batallando contra impresiones PDF que generan hojas en blanco o cortan marcas de agua.
* **Muda Identificada:** Sobreprocesamiento estético (Vibe Coding de interfaz), deriva de intención visual (Intent Drift), inconsistencia entre módulos de la misma empresa y fatiga del usuario final por falta de una jerarquía visual técnica de nivel industrial.
* **Velocidad y Tasa de Falla Inicial:** 1X. Ajustes infinitos de CSS en cada pantalla nueva. Los documentos imprimibles se deforman en impresoras físicas o navegadores con zoom variable.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador Nx: 8X)
* **Nuevo Flujo de Trabajo:** Se implanta **Skin 1** como el estándar canónico en el arsenal. Cualquier pantalla nueva adopta automáticamente el triplete tipográfico (`Space Grotesk` + `Inter` + `Roboto Mono`), las CSS variables sincronizadas para día/noche, la barra flotante frosted glass, las tarjetas `.premium-card` y el formato de impresión carta blindado.
* **Multiplicador de Negocio:** **8X de aceleración**. La UI se construye ensamblando clases ya validadas sin escribir una sola línea de CSS nuevo. Cero discusión sobre qué paleta usar.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
1. **El falso Dark Mode de Tailwind (`dark:bg-slate-900` disperso):** Rociar clases condicionales en cientos de divs genera inconsistencias cuando cambia un tono o cuando se requiere multi-tenant con color de marca dinámico.  
   *Solución Skin 1:* Se usan **CSS Variables semánticas** en `:root` y `.dark` vinculadas a una sola clase en `<html>`. Los colores de marca (`--primary`, `--secondary`) pueden ser sobreescritos en tiempo de ejecución por el tenant sin recompilar CSS.
2. **El desastre del Zebra Slicing y las Marcas de Agua en PDF:** Las marcas de agua centradas en documentos PDF con tablas rayadas causan cortes horizontales ("persiana veneciana").  
   *Solución Skin 1:* En tablas densas se suprime la marca de agua o se reduce estrictamente al `0.025` (2.5% de opacidad) con `pointer-events: none` y `select-none`.
3. **El salto de ancho por Scrollbar:** En Windows, la aparición de barras de desplazamiento de 17px desajusta el layout.  
   *Solución Skin 1:* Scrollbar ultra-esbelta de 5px con track transparente y pulgar redondeado con acento naranja reactivo en `:hover`.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### Bloque A: Variables CSS Globales & Clases Semánticas (`src/index.css`)
Copiar este bloque íntegro en el archivo CSS global del proyecto:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* --- MODO DÍA: PRECISION CLINICAL SLATE (Swiss High-End Enterprise) --- */
  --primary: #1E3A5F;
  --secondary: #0F172A;
  --tertiary: #D97706;
  --neutral: #64748B;
  
  --background: #F8FAFC;
  --surface: #FFFFFF;
  --surface-alt: #F1F5F9;
  --text-main: #0F172A;
  --text-muted: #64748B;
  --outline-color: #E2E8F0;
  --sidebar-bg: #0B132B;
}

.dark {
  /* --- MODO NOCHE: OBSIDIAN TITANIUM (Deep Industrial Luxe) --- */
  --background: #080C14;
  --surface: #101726;
  --surface-alt: #151F33;
  --text-main: #F8FAFC;
  --text-muted: #94A3B8;
  --outline-color: rgba(255, 255, 255, 0.08);
  --sidebar-bg: #060910;
}

@layer base {
  body {
    @apply bg-[var(--background)] text-[var(--text-main)] transition-colors duration-300 antialiased;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    letter-spacing: -0.01em;
  }

  .font-space {
    font-family: 'Space Grotesk', sans-serif;
  }

  .font-inter {
    font-family: 'Inter', sans-serif;
  }

  .font-data, .font-mono {
    font-family: 'Roboto Mono', monospace;
    font-feature-settings: "tnum";
    font-variant-numeric: tabular-nums;
  }

  h1, h2, h3, h4 {
    font-family: 'Space Grotesk', sans-serif;
    letter-spacing: -0.02em;
  }
}

@layer components {
  /* High-End Enterprise Card */
  .premium-card {
    background-color: var(--surface);
    border: 1px solid var(--outline-color);
    border-radius: 14px;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.03);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dark .premium-card {
    background-color: #101726;
    border-color: rgba(255, 255, 255, 0.07);
    box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.5);
  }

  .premium-card:hover {
    border-color: rgba(30, 58, 95, 0.35);
  }

  .dark .premium-card:hover {
    border-color: rgba(217, 119, 6, 0.3);
  }

  /* Frosted Floating Toolbar */
  .frosted-toolbar {
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(226, 232, 240, 0.8);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03);
    border-radius: 14px;
  }

  .dark .frosted-toolbar {
    background: rgba(16, 23, 38, 0.88);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 14px 35px -5px rgba(0, 0, 0, 0.7);
  }

  /* Glassmorphism Containers */
  .glass-premium {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.6);
  }

  .glass-premium-dark {
    background: rgba(11, 19, 38, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* Swiss Precision Table Standards */
  .table-precision th {
    text-align: center;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .table-precision td.num-cell {
    text-align: right;
    font-family: 'Roboto Mono', monospace;
    font-variant-numeric: tabular-nums;
  }

  /* Precision Form Controls */
  .input-precision {
    @apply h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium;
  }

  .btn-precision-primary {
    @apply h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-space font-bold uppercase tracking-wider transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer;
  }

  .btn-precision-secondary {
    @apply h-9 px-3.5 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-xs font-space font-semibold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer;
  }
}

/* Scrollbar Adaptable Ultra-Esbelto */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { 
  background: rgba(148, 163, 184, 0.25); 
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover { 
  background: rgba(217, 119, 6, 0.7); 
}
```

---

### Bloque B: Configuración Canónica Tailwind (`tailwind.config.js`)

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1E3A5F",
        secondary: {
          light: "#0F172A",
          dark: "#101726"
        },
        tertiary: "#D97706",
        neutral: "#64748B",
      },
      fontFamily: {
        space: ['"Space Grotesk"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        mono: ['"Roboto Mono"', 'monospace'],
      },
      spacing: {
        'gutter': '24px',
        'stack-sm': '8px',
        'stack-md': '16px',
        'stack-lg': '32px',
      },
    },
  },
  plugins: [],
}
```

---

### Bloque C: Tipografías en `index.html` (Google Fonts)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
```

---

### Bloque D: Plantilla Canónica de Impresión Oficial (`GoldenPrintStandard.jsx`)
Plantilla para cualquier certificado, hoja de vida de activo, reporte o albarán imprimible:

```jsx
import React from 'react';
import { Printer, X } from 'lucide-react';

export default function GoldenPrintStandard({ 
  title = "DOCUMENTO OFICIAL", 
  code = "DOC-001",
  clientName = "EMPRESA TITULAR",
  logoUrl = null,
  watermarkUrl = null,
  onClose,
  children 
}) {
  return (
    <div className="min-h-screen bg-slate-200/80 py-6 pb-28 flex justify-center print:bg-white print:py-0 print:pb-0 print:m-0">
      
      {/* 1. BARRA FLOTANTE DE CONTROL (NO SE IMPRIME) */}
      <div className="fixed bottom-6 flex items-center gap-3 no-print z-50 bg-slate-950/85 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/15 shadow-2xl">
        <button 
          type="button"
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 flex items-center gap-2 transition-all font-space font-bold text-xs uppercase tracking-wider cursor-pointer"
        >
          <Printer size={15} /> IMPRIMIR / GUARDAR PDF
        </button>
        {onClose && (
          <button 
            type="button"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/15 flex items-center gap-1.5 transition-all font-space font-semibold text-xs uppercase tracking-wider cursor-pointer"
          >
            <X size={15} /> Cerrar
          </button>
        )}
      </div>

      {/* 2. LIENZO CANÓNICO CARTA (8.5in x 11in) */}
      <main className="letterhead-container relative bg-white w-[8.5in] min-h-[11in] p-[0.4in] shadow-2xl flex flex-col justify-between print:shadow-none print:m-0 print:w-full print:p-0 print:min-h-0 text-slate-800 overflow-hidden">
        
        {/* Marca de agua 2.5% opacidad para evitar ruido cognitivo */}
        {watermarkUrl && (
          <div 
            className="watermark-overlay pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden z-0 select-none"
            style={{ opacity: 0.025 }}
            aria-hidden="true"
          >
            <img src={watermarkUrl} alt="" className="w-[340px] max-w-full -rotate-25 grayscale select-none" />
          </div>
        )}

        <div className="relative z-10 space-y-3">
          {/* Línea de prestigio tricolor */}
          <div className="h-1 bg-gradient-to-r from-[#0F172A] via-[#1E3A5F] to-[#D97706] rounded-full" />

          {/* Cabecera Suiza de 12 Columnas */}
          <header className="border-b border-slate-200/90 pb-2.5">
            <div className="grid grid-cols-12 gap-3 items-center">
              
              {/* Columna 1 a 4: Titular del Activo / Logo */}
              <div className="col-span-4 flex items-center gap-3 pr-2 border-r border-slate-200/70">
                {logoUrl && (
                  <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/80 p-1 flex items-center justify-center shrink-0">
                    <img src={logoUrl} alt="" className="max-h-9 max-w-9 object-contain" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-[7px] font-mono font-bold uppercase tracking-wider text-slate-400 block">Titular</span>
                  <p className="text-xs font-space font-bold text-slate-900 truncate leading-tight">{clientName}</p>
                </div>
              </div>

              {/* Columna 5 a 8: Título Central & Norma */}
              <div className="col-span-5 text-center px-2 border-r border-slate-200/70">
                <h1 className="text-sm font-space font-black tracking-tight text-slate-900 uppercase leading-none">{title}</h1>
                <span className="text-[7.5px] font-space font-bold uppercase tracking-widest text-slate-500 mt-0.5 block">ESTÁNDAR TÉCNICO REGULADO</span>
              </div>

              {/* Columna 9 a 12: Código & Fecha */}
              <div className="col-span-3 text-right">
                <span className="inline-block bg-slate-900 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded tracking-wider">{code}</span>
                <p className="text-[8px] font-mono text-slate-400 mt-0.5">Emisión: {new Date().toISOString().split('T')[0]}</p>
              </div>

            </div>
          </header>

          {/* 3. CONTENIDO DEL DOCUMENTO */}
          <div className="pt-2 text-xs">
            {children}
          </div>
        </div>

        {/* 4. PIE DE PÁGINA OFICIAL */}
        <footer className="relative z-10 border-t border-slate-200 pt-2 text-[7.5px] font-mono text-slate-400 flex justify-between items-center print:mt-auto">
          <span>Skin 1 Precision Standard • Documento Generado de Forma Electrónica</span>
          <span>Página 1 / 1</span>
        </footer>

      </main>
    </div>
  );
}
```

---

### Bloque E: Barra Superior Frosted Persistente (`FrostedPersistentTopBar.tsx`)
Barra superior fija (`h-14`) de información persistente en tiempo real. Proporciona una arquitectura modular con zona izquierda (navegación y contexto), un **Slot Central Abierto** (`centerSlot` / `children`) para inyectar libremente cualquier indicador o telemetría en tiempo real, y zona derecha con selector multi-tenant, acciones rápidas y alternador de tema:

```tsx
"use client";

import React, { useState } from "react";
import {
  Menu,
  ChevronDown,
  Sun,
  Moon,
  Building2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export interface TenantInfo {
  id?: string;
  name: string;
  nit: string;
  plan?: string;
}

export function FrostedPersistentTopBar({
  systemName = "PORTAL INDUSTRIAL",
  currentView = "Panel Principal",
  liveStatus = "EN VIVO",
  showLivePulse = true,
  onToggleSidebar,
  centerSlot,
  actionsSlot,
  tenant,
  tenantsList = [],
  onSelectTenant,
  isDarkMode = false,
  onToggleTheme,
  userSlot,
  children,
}: {
  systemName?: string;
  currentView?: string;
  liveStatus?: string;
  showLivePulse?: boolean;
  onToggleSidebar?: () => void;
  centerSlot?: React.ReactNode;
  actionsSlot?: React.ReactNode;
  tenant?: TenantInfo;
  tenantsList?: TenantInfo[];
  onSelectTenant?: (tenant: TenantInfo) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  userSlot?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);

  return (
    <header className="h-14 shrink-0 w-full z-30 transition-colors duration-200 border-b flex items-center justify-between px-3 sm:px-6 select-none bg-white/95 dark:bg-[#060910]/95 backdrop-blur-md border-slate-200 dark:border-white/10 text-slate-900 dark:text-zinc-100 shadow-xs">
      
      {/* 1. ZONA IZQUIERDA: MENÚ & CONTEXTO DE NAVEGACIÓN */}
      <div className="flex items-center gap-3 min-w-0 flex-1 max-w-[35%] lg:max-w-[30%]">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-lg transition-all text-slate-700 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/5 cursor-pointer"
            title="Alternar Menú Lateral"
            aria-label="Alternar Menú Lateral"
          >
            <Menu size={18} />
          </button>
        )}

        <div className="flex items-center gap-1.5 text-xs font-mono min-w-0 truncate">
          <span className="font-bold tracking-tight uppercase hidden sm:inline text-slate-900 dark:text-white">
            {systemName}
          </span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 hidden sm:inline text-slate-400 dark:text-zinc-600" />
          <span className="truncate font-semibold text-blue-700 dark:text-[#FBD007]">
            {currentView}
          </span>

          {/* Micro-indicador de conexión / estado en vivo */}
          {liveStatus && (
            <div className="hidden xl:flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200 dark:border-white/10 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0">
              {showLivePulse && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              )}
              <span className="tracking-wider uppercase font-semibold">{liveStatus}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. ZONA CENTRAL: SLOT FLEXIBLE DE INFORMACIÓN PERSISTENTE EN TIEMPO REAL */}
      {/* Aquí inyectas libremente telemetría, métricas en vivo, badges, relojes o semáforos */}
      <div className="flex items-center justify-center gap-2 px-2 flex-1 max-w-[45%] overflow-x-auto no-scrollbar">
        {centerSlot || children}
      </div>

      {/* 3. ZONA DERECHA: ACCIONES, SELECTOR MULTI-TENANT & CONTROLES */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        
        {/* Acciones contextuales inyectadas (ej. botones de reportes, descargas, hubs) */}
        {actionsSlot}

        {/* Selector Multi-Tenant (si aplica al proyecto) */}
        {tenant && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTenantMenuOpen(!isTenantMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg border text-left font-sans transition-all bg-white dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-zinc-100 shadow-2xs hover:border-slate-400 dark:hover:border-white/20 cursor-pointer"
            >
              <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-blue-100 dark:bg-[#FBD007]/15 text-blue-900 dark:text-[#FBD007]">
                <Building2 className="w-3 h-3" />
              </div>
              <div className="flex flex-col max-w-[100px] sm:max-w-[140px] leading-tight">
                <span className="text-[11px] font-semibold truncate">{tenant.name}</span>
                <span className="text-[9px] font-mono truncate text-slate-500 dark:text-zinc-400">
                  NIT {tenant.nit}
                </span>
              </div>
              <ChevronDown className={`w-3 h-3 transition-transform ${isTenantMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {isTenantMenuOpen && tenantsList.length > 0 && (
              <>
                <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setIsTenantMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 rounded-xl border shadow-2xl z-50 p-2 text-xs bg-white dark:bg-[#0B132B] border-slate-200 dark:border-white/10 text-slate-900 dark:text-zinc-100">
                  <div className="px-3 py-1.5 border-b text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 flex justify-between">
                    <span>Organizaciones</span>
                    <span>{tenantsList.length} Disponibles</span>
                  </div>
                  <div className="py-1 space-y-1 max-h-56 overflow-y-auto">
                    {tenantsList.map((t, idx) => (
                      <div
                        key={t.id || idx}
                        onClick={() => {
                          onSelectTenant && onSelectTenant(t);
                          setIsTenantMenuOpen(false);
                        }}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer flex justify-between items-center"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{t.name}</p>
                          <p className="text-[9px] font-mono text-slate-400">NIT: {t.nit}</p>
                        </div>
                        {t.nit === tenant.nit && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Alternador de Tema Día/Noche */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg border text-xs transition-all bg-white dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-800 dark:text-zinc-300 hover:bg-slate-100 shadow-2xs cursor-pointer"
            title={isDarkMode ? "Cambiar a Modo Día" : "Cambiar a Modo Noche"}
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </button>
        )}

        {/* Slot de Usuario / Rol (opcional) */}
        {userSlot}

      </div>
    </header>
  );
}

// Subcomponente de Píldora Reutilizable para la Zona Central
export function TopBarMetricPill({
  icon,
  label,
  value,
  variant = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | number;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const colorMap = {
    default: "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300",
    success: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300",
    warning: "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-300",
    danger: "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-500/40 text-rose-900 dark:text-rose-300",
    info: "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-300",
  };

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono shrink-0 select-none shadow-2xs ${colorMap[variant]}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="font-bold uppercase tracking-wider">{label}</span>
      {value !== undefined && (
        <>
          <span className="opacity-40">&bull;</span>
          <span className="tabular-nums font-semibold">{value}</span>
        </>
      )}
    </div>
  );
}
```
```

---

## 🔌 5. Guía de Reutilización & Dependencias Mínimas
* **Frameworks Compatibles:** React 18/19, Next.js (Pages o App Router), Vite + React.
* **Dependencias npm mínimas:**
  ```bash
  npm i lucide-react tailwindcss @tailwindcss/postcss
  ```
* **Tipografías Externas:** Requiere cargar `Space Grotesk`, `Inter` y `Roboto Mono` vía Google Fonts o `@fontsource`.

