# REF-SISTEMA-DISENO-SKIN-2: Repositorio de Páginas Bellas de Inspiración & Estándar "Apothecary / Botanical Luxury" (60-30-10)

> **Propósito en el Arsenal Global:** Banco comercial y técnico de inspiración visual de alto standing para vender y desplegar e-commerce D2C de lujo silencioso, marcas gastronómicas/agroindustriales, cosmética botánica, café de especialidad y consultoría de sostenibilidad/territorio.
> **Activación:** Invocar desde `/disenador-web` pidiendo **"Skin 2"**, **"Diseño Aesop / Brightland"** o **"Catálogo de Inspiración Luxury"**.

---

## 1. Tríada Fundacional de Páginas Bellas de Inspiración (Benchmarks Oficiales)

Cada vez que un cliente de **Delta CoreTech** busque una web que se sienta "costosa, editorial, internacional y con alma", se presenta esta tríada de referentes mundiales según el ángulo de negocio:

| # | Marca Referente | URL Oficial | Arquetipo Visual & Qué Venderle al Cliente | Cuándo Usarla |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Aesop** | [`https://www.aesop.com/`](https://www.aesop.com/) | **Lujo Silencioso & Botica Arquitectónica (*Apothecary Luxury*):** Lienzo continuo en alabastro cálido (`#FFFEF2`), paneles divididos en tierra/ámbar profundo (`#2B1E14`), geometría recta de `0px` (`rounded-none`), líneas capilares de `1px` y **Sistema de Doble Fotografía por Producto** (*Foto A: Silencio de estudio* + *Foto B: Bodegón claroscuro en hover*). | Cosmética, bienestar, alimentos de autor, destilados, marcas gourmet de culto, estudios de arquitectura o firmas consultoras boutique. |
| **2** | **Brightland** | [`https://brightland.co/`](https://brightland.co/) | **Sol Californiano & Conversión Gastronómica D2C:** Luz matinal cálida, envases sobre fondo infinito crema con 40% de aire negativo, micro-etiquetas rectangulares (`1px border`), vitrina de *Best Sellers* debajo del Hero y motor de suscripción recurrente (*Build Your Set / Mi Despensa*). | Aceites, conservas, café de especialidad, chocolatería fina, panadería artesanal, bebidas funcionales y cajas de suscripción mensual. |
| **3** | **Patagonia Provisions** | [`https://www.patagonia.com/provisions/`](https://www.patagonia.com/provisions/) | **Trazabilidad Regenerativa & Documental de Territorio:** Fotografía documental con grano analógico cálido, mapas de origen, relato de cadenas productivas campesinas y puente orgánico entre producto físico (B2C) e impacto/consultoría socio-ambiental (B2B). | Agroindustria sostenible, cooperativas exportadoras, ONGs, proyectos de bioeconomía, turismo regenerativo y consultoría rural. |

---

## 2. Dos Paletas Maestras `60% - 30% - 10%` Listas para Producción

### Variante 2A — "Aesop Apothecary" (Claroscuro Tierra & Alabastro)
Ideal para marcas sobrias, intelectuales y de lujo silencioso extremo:

| Proporción | Nombre del Token | Variable CSS | HEX / Valor | Uso Estricto en Interfaz |
| :---: | :--- | :--- | :---: | :--- |
| **60% (Lienzo Infinito)** | **Alabastro Cálido Aesop** | `--lux-canvas-primary` | **`#FFFEF2`** | Fondo continuo de toda la página y del **Estado A** de las fotos de producto (el producto se funde con la web sin tarjetas blancas ni grises). |
| **60% (Lienzo Alterno)** | **Pergamino Arena** | `--lux-canvas-secondary` | **`#F6F5E8`** | Secciones de transición editorial, citas, especificaciones técnicas y resumen de compra. |
| **30% (Claroscuro)** | **Ámbar Tierra / Deep Umber** | `--lux-brand-deep` | **`#2B1E14` → `#4E3824`** | Paneles laterales divididos (*Split Hero* y *Split Vitrina `35%/65%`*), bloques ejecutivos B2B, botones primarios y Footer. |
| **30% (Claroscuro)** | **Obsidiana Tierra** | `--lux-brand-obsidian` | **`#1E150C`** | Estado `:hover` de botones principales y superficies de máximo contraste. |
| **30% (Tipografía)** | **Carbón Botánico** | `--lux-ink-body` | **`#252525`** | Títulos, pestañas activas, nombres de producto y precios. |
| **30% (Tipografía)** | **Piedra Seca** | `--lux-ink-muted` | **`#666666`** | Ingredientes o notas de cata separados por comas (*Ej: Kale Orgánico, Nueces del Brasil, Aceite de Oliva*) y gramajes. |
| **30% (Bodegón Foto B)** | **Oliva Umber Claroscuro** | `--lux-stilllife-stage` | **`#756851` → `#241F17`** | Escenografía geométrica en penumbra exclusiva para la **Foto B** (*Hover / Producto Central Destacado*). |
| **10% (Acento Lote)** | **Siena Tostado / Cobre** | `--lux-accent-sienna` | **`#7A4E2D`** | Micro-etiquetas superiores (*Cosecha de temporada*, *Edición limitada*) e indicadores sutiles. |
| **10% (Acento Claro)** | **Marfil sobre Umber** | `--lux-accent-ivory` | **`#EBE6DC`** | Texto y botones fantasma rectangulares (`1px solid rgba(235, 230, 220, 0.65)`) sobre paneles oscuros `#2B1E14`. |
| **10% (Estructura)** | **Línea Capilar (`1px`)** | `--lux-border-hairline` | **`rgba(37, 37, 37, 0.15)`** | Divisiones rectas de `1px`, subrayado de pestañas y tablas de ficha técnica (`border-radius: 0px`). |

---

### Variante 2B — "Brightland Botanical" (Verde Bosque, Piedra Sabana & Ocre Dorado)
Ideal para marcas frescas, luminosas y mediterráneas/tropicales:

| Proporción | Nombre del Token | Variable CSS | HEX / Valor | Uso Estricto en Interfaz |
| :---: | :--- | :--- | :---: | :--- |
| **60% (Lienzo)** | **Alabastro Botánico** | `--lux-canvas-primary` | **`#FDF8F6`** | Fondo principal continuo cálido. |
| **60% (Lienzo)** | **Piedra Sabana / Lino** | `--lux-canvas-secondary` | **`#F4EDE4`** | Fondo secundario para alternar secciones sin ondas decorativas. |
| **60% (Superficie)** | **Infinito Estudio** | `--lux-surface-card` | **`#F8F6F2`** | Lienzo de tarjeta de producto con 40% de aire negativo y sombra de piso suave. |
| **30% (Autoridad)** | **Verde Bosque Profundo** | `--lux-brand-deep` | **`#025357` / `#01383B`** | Títulos Serif (`Playfair Display`), botones principales, Navbar/Footer y bloque ejecutivo B2B. |
| **30% (Tipografía)** | **Carbón Editorial / Herbario** | `--lux-ink-body` | **`#2C302E` / `#6E7571`** | Lectura larga y metadatos técnicos. |
| **10% (Acentos Joya)** | **Ocre Dorado & Bronce** | `--lux-accent-gold` | **`#D6BD98` / `#8C6D46`** | Filetes arquitectónicos, sellos de lote y eyebrows en mayúsculas espaciadas (`tracking-[0.2em]`). |
| **10% (Conversión)** | **Terracota & Salvia** | `--lux-accent-cta` | **`#D46A5E` / `#AFBF71`** | Micro-dosis en badges de ahorro (*Ahorra 15%*) y píldoras de origen (*100% Natural*). |

---

## 3. Patrones Arquitectónicos de Interfaz (UI Patterns)

1. **Layout Split Editorial `35% / 65%` (Patrón Insignia Aesop):**
   - **Columna Izquierda (`35%`):** Panel inmersivo en tono oscuro (`#2B1E14` o `#025357`) o fotografía a sangre completa con titular poético, párrafo corto y botón fantasma rectangular de `1px` (`Explorar colección →`).
   - **Columna Derecha (`65%`):** Fondo claro continuo (`#FFFEF2`) con barra superior de categorías subrayadas a `1px` (`Fresh | Floral | Woody` o `Sal | Dulce | Vinagretas`) y grilla/carrusel de 3 columnas.
2. **Geometría Recta `0px` (`rounded-none`) y Cero Efectos Baratos:**
   - Prohibidas las ondas SVG decorativas entre secciones, las sombras difusas gigantes (`shadow-2xl`), los bordes inflados (`rounded-3xl`) y las transparencias lavadas al 50%.
   - Toda la información del producto (badge superior, ícono `Bookmark`, título, 3 ingredientes separados por comas, gramaje y precio) vive en el **HTML limpio debajo de la imagen**, nunca quemada en el PNG.

---

## 4. Pipeline Óptico de Fotografía de Producto con `sharp` (*Dual-Photo System*)

Cuando el cliente solo tiene fotos caseras o recortes PNG crudos (`*_sin.png`) y no tiene presupuesto para una sesión fotográfica de \$15.000 USD, aplicamos el motor determinista en Node.js (`sharp`) sin alterar ni alucinar las etiquetas reales:

1. **Revelado Óptico en 3 Zonas sobre el Envase Real:**
   - **Zona 1 (Tapa / Cuello Superior `0% - 11.5%`):** Curva S especular + luz de rebote lateral (`softboxHighlight`) para dar acabado de bronce/latón cepillado o corcho natural.
   - **Zona 2 (Vidrio / Contenido Visible):** Levantamiento selectivo de sombras (`gamma 0.84`) + caída cilíndrica lateral (`cylinderRoll`) para dar volumen 3D al cristal.
   - **Zona 3 (Etiqueta):** *Defringing* de bordes (`1px alpha smoothing` para eliminar el halo dentado del recorte), nitidez óptica (`sharpen({ sigma: 1.0, m1: 1.0, m2: 2.0 })`) y atemperado cálido del papel.
2. **Generación Automática de las 2 Fotos por Producto (Estilo Aesop):**
   - **Foto A (*Silencio de Estudio* — Por defecto):** El envase revelado ocupa solo el 55% de la altura del lienzo sobre `#FFFEF2` (45% de espacio negativo) con una **doble elipse de sombra de contacto oscura y corta** en la base (`feGaussianBlur stdDeviation="16 5"` + `"5 1.8"`).
   - **Foto B (*Bodegón Claroscuro Botánico* — En `:hover` y en el producto central destacado):** El mismo envase se compone sobre un recuadro recto en tonos tierra/oliva (`#756851` → `#241F17`), planos geométricos de papel plegado/luz diagonal en penumbra, sombra proyectada en la pared y la silueta botánica del ingrediente real.
