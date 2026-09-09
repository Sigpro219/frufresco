---
description: Regla estricta de iconografía. Obliga el uso exclusivo de componentes SVG de lucide-react y prohíbe terminantemente el uso de emojis unicode en cualquier parte de la interfaz.
globs: src/components/**/*.tsx, src/app/**/*.tsx
---

# Regla: Iconografía Exclusiva Lucide React (Prohibición Total de Emojis)

Al diseñar, crear, auditar o modificar cualquier componente, vista, tabla, modal o elemento visual:

1. **Uso Exclusivo de Lucide React:**
   - Todos los íconos visuales deben ser componentes SVG vectoriales importados exclusivamente de lucide-react.
   - Ejemplo correcto: import { Sprout, Carrot, Apple, Package, Layers, Users, AlertTriangle } from 'lucide-react';

2. **Prohibición Terminante de Emojis Unicode en UI:**
   - Queda estrictamente prohibido renderizar emojis de texto unicode (ej. 🥬, 🥦, 🥔, 🍎, 🧀, 🥩, 📦, 👤, ⚠️, etc.) en tarjetas, encabezados, badges, píldoras de estado, botones o listas.
   - En modales o formularios que requieran seleccionar un icono (ej. "Nueva Célula"), está prohibido ofrecer selectores de emojis. Se deben ofrecer botones o catálogos con íconos vectoriales Lucide.

3. **Mapeo Obligatorio de Datos Heredados de Base de Datos:**
   - Si una tabla o registro de base de datos (pp_settings, categorías, células, etc.) contiene un campo de icono con texto o emoji (ej. icon: "🥬" o icon_type: "hortalizas"), **NUNCA** se debe imprimir dicho valor crudo en el JSX.
   - Debe implementarse siempre una función o helper de mapeo que devuelva el componente SVG de Lucide correspondiente:
     `	sx
     export const renderCellLucideIcon = (iconKey?: string, size = 16) => {
         switch (iconKey?.toLowerCase()) {
             case '🥬':
             case 'sprout':
             case 'hortalizas': return <Sprout size={size} />;
             case '🥦':
             case 'carrot':
             case 'verduras': return <Carrot size={size} />;
             case '🍎':
             case 'apple':
             case 'frutas': return <Apple size={size} />;
             case '🧀':
             case 'boxes':
             case 'abarrotes': return <Boxes size={size} />;
             case '🥔':
             case 'layers':
             case 'papas': return <Layers size={size} />;
             default: return <Package size={size} />;
         }
     };
     `

4. **Coherencia Visual y Escala:**
   - Todos los iconos Lucide deben tener tamaños consistentes (size={14}, size={16}, size={18} o size={20} según la jerarquía) y strokeWidth={1.5} o strokeWidth={2} alineados con la identidad visual corporativa.
