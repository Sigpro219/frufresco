---
name: antigravity-loaders-ui
description: Componentes y animaciones oficiales de carga al estilo Google Antigravity / Gemini. Incluye el spinner de matriz 2x2 de 4 puntos pulsantes (4-Dots Pulsing Grid Spinner) y el efecto de texto en onda luminosa (Wave Shimmer Text) para estados de carga, transiciones de datos y avisos multitenant.
---

# 🛸 Antigravity Loaders UI (Iconic Loaders & Wave Shimmer Text)

## 🎯 Misión & Identidad
Esta habilidad documenta y provee las implementaciones canónicas en **React + Tailwind CSS** de las dos animaciones de identidad visual características de **Google Antigravity & Gemini**:
1. **`AntigravityDotsSpinner` (4-Dots Pulsing Grid):** Matriz 2x2 de cuatro puntos circulares con animación de escala y opacidad desfasada en ondas rotatorias o diagonales.
2. **`WaveShimmerText` (Texto en Onda Luminosa):** Gradiente de texto fluido con barrido horizontal de luz suave (inspirado en *"1 task running"* / *"Pensando..."*), ideal para transiciones sin parpadeos.

---

## 🎨 Especificación de Diseño & Animaciones CSS

### 1. Keyframes en Tailwind o CSS Global
Añadir a `globals.css` o `tailwind.config.ts`:

```css
@keyframes agyPulseDot {
  0%, 100% {
    transform: scale(0.65);
    opacity: 0.35;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
    filter: drop-shadow(0 0 6px rgba(251, 208, 7, 0.6));
  }
}

@keyframes agyTextWave {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-agy-dot-1 {
  animation: agyPulseDot 1.4s ease-in-out infinite 0s;
}
.animate-agy-dot-2 {
  animation: agyPulseDot 1.4s ease-in-out infinite 0.2s;
}
.animate-agy-dot-3 {
  animation: agyPulseDot 1.4s ease-in-out infinite 0.4s;
}
.animate-agy-dot-4 {
  animation: agyPulseDot 1.4s ease-in-out infinite 0.6s;
}

.animate-agy-text-wave {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(251, 208, 7, 0.95) 50%,
    rgba(255, 255, 255, 0.4) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: agyTextWave 2.2s linear infinite;
}

.animate-agy-text-wave-emerald {
  background: linear-gradient(
    90deg,
    rgba(167, 243, 208, 0.5) 0%,
    rgba(52, 211, 153, 1) 50%,
    rgba(167, 243, 208, 0.5) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: agyTextWave 2.2s linear infinite;
}
```

---

## 🧩 Implementación de Componentes React

### Componente 1: `AntigravityDotsSpinner`
```tsx
import React from "react";
import { cn } from "@/lib/utils";

interface AntigravityDotsSpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: "amber" | "emerald" | "white" | "cyan";
  className?: string;
}

export function AntigravityDotsSpinner({
  size = "md",
  color = "amber",
  className,
}: AntigravityDotsSpinnerProps) {
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : size === "lg" ? "w-2.5 h-2.5" : "w-2 h-2";
  const gapSize = size === "sm" ? "gap-1" : size === "lg" ? "gap-1.5" : "gap-1.2";

  const colorMap = {
    amber: "bg-[#FBD007]",
    emerald: "bg-emerald-400",
    white: "bg-white",
    cyan: "bg-cyan-400",
  };

  const bg = colorMap[color] || colorMap.amber;

  return (
    <div className={cn("inline-grid grid-cols-2 select-none", gapSize, className)} aria-label="Cargando">
      <span className={cn("rounded-full animate-agy-dot-1", dotSize, bg)} />
      <span className={cn("rounded-full animate-agy-dot-2", dotSize, bg)} />
      <span className={cn("rounded-full animate-agy-dot-3", dotSize, bg)} />
      <span className={cn("rounded-full animate-agy-dot-4", dotSize, bg)} />
    </div>
  );
}
```

### Componente 2: `WaveShimmerText`
```tsx
import React from "react";
import { cn } from "@/lib/utils";

interface WaveShimmerTextProps {
  text: string;
  variant?: "amber" | "emerald" | "zinc";
  className?: string;
}

export function WaveShimmerText({
  text,
  variant = "amber",
  className,
}: WaveShimmerTextProps) {
  const variantClass =
    variant === "emerald"
      ? "animate-agy-text-wave-emerald"
      : variant === "zinc"
      ? "animate-agy-text-wave-zinc"
      : "animate-agy-text-wave";

  return (
    <span className={cn("font-mono text-xs font-semibold tracking-wide select-none", variantClass, className)}>
      {text}
    </span>
  );
}
```

---

## 🎯 Caso de Uso: Cartel de Carga Multitenant
Para evitar que un cliente predeterminado (ej. Ingyemel) parpadee antes de que se monte el cliente real del usuario (ej. K Air Logistics):

```tsx
<div className="flex flex-col items-center justify-center p-8 space-y-3 rounded-2xl bg-zinc-950/70 border border-white/10 backdrop-blur-md">
  <AntigravityDotsSpinner size="lg" color="amber" />
  <div className="flex flex-col items-center gap-1 text-center">
    <WaveShimmerText text="Sincronizando Entorno Multitenant..." variant="amber" />
    <span className="text-[11px] font-mono text-zinc-400">
      Cargando credenciales y radar SECOP II
    </span>
  </div>
</div>
```
