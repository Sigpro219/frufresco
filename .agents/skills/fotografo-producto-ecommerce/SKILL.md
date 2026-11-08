---
name: fotografo-producto-ecommerce
description: Especialista en fotos de producto para tiendas en línea (Foto 1 de estudio y Foto 2 de composición/escena con ingredientes). Activar SIEMPRE que se pida crear, retocar, componer o reemplazar imágenes de producto, fondos con ingredientes, efectos hover entre fotos, o subir imágenes de producto a Firebase Storage/Firestore.
---

# Fotógrafo de Producto E-commerce

Nació de un incidente real (Zeticas, oct-2026): se perdió ~1 hora y se publicaron imágenes rotas por intentar componer escenas fotográficas pegando píxeles con `sharp`. La IA de edición con referencias lo resolvió en 1 intento.

## Ley 1 — Herramienta correcta
| Tarea | Herramienta |
|---|---|
| Cambiar ángulo de cámara, perspectiva, luz, poner el producto en una escena con ingredientes | **image-generator (edición IA) con referencias** |
| Redimensionar, recortar, quitar fondo, enfocar, sombra de contacto, convertir formato | Código (`sharp`) |

PROHIBIDO intentar simular perspectiva 3D, inclinar o deformar botellas, o "collage" de recortes de otras fotos por código.

## Ley 2 — Estudiar la referencia ANTES de generar
1. Listar (no adivinar) las fotos existentes del catálogo (`Get-ChildItem`) y abrir 2–3 de las que el usuario considera "buenas".
2. Describir en 3–5 viñetas el estilo común (ángulo, tamaño del producto en cuadro, fondo, superficie, ingredientes, luz).
3. Confirmar esas viñetas con el usuario en una línea si hay dudas.

## Ley 3 — Prompt de edición
Pasar al image-generator: (a) la foto REAL del producto como referencia principal, exigiendo conservar etiqueta, logo, tapa y color del contenido; (b) 2–3 fotos de estilo; (c) ingredientes reales de la receta/BOM del SKU. Una sola generación por SKU (cuidar presupuesto).

## Ley 4 — Nada a producción sin "sí" explícito
- Mostrar el resultado al usuario (carrusel) y advertir de defectos (p. ej. letra pequeña de la etiqueta alterada por la IA).
- Solo tras aprobación: convertir a 800×800, subir a Storage en carpeta versionada y actualizar Firestore.

## Ley 5 — Bloqueo de alcance y respaldo
- Tocar SOLO los SKUs pedidos. Nunca "aprovechar" para modificar otros productos.
- Antes de sobrescribir `image_url`/`image_url_2`, guardar la URL anterior en un manifiesto para poder revertir.

## Ley 6 — Regla de los 2 fallos
Si un enfoque falla 2 veces, DETENERSE: informar al usuario qué falló y proponer otro camino. No seguir parchando el mismo script.

## Ley 7 — Comunicación y tokens
- Si el usuario pregunta algo ("¿qué sucede?"), responder ANTES de ejecutar herramientas.
- Listar carpetas antes de leer rutas; editar scripts en vez de reescribirlos completos.

## Secreto sucio del Gemba
La IA de edición tiende a alterar la letra pequeña (teléfono, URL, tabla nutricional). A tamaño de tarjeta no se nota; avisarlo siempre y ofrecer corrección si el usuario lo exige.
