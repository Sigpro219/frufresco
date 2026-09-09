'use client';

import { PaperSize } from './types';

export interface PrintViaNewWindowOptions {
    /** Elemento DOM o ref.current a imprimir */
    element?: HTMLElement | null;
    /** O contenido HTML crudo si no se pasa elemento */
    content?: string;
    /** Título de la ventana emergente y nombre sugerido al guardar en PDF */
    title?: string;
    /** Tamaño del papel: 'letter' (defecto) o 'a4' */
    paperSize?: PaperSize;
    /** Orientación: 'portrait' (defecto) o 'landscape' */
    orientation?: 'portrait' | 'landscape';
    /** Margen @page CSS (por defecto milimétrico según orientación) */
    margin?: string;
    /** Estilos CSS adicionales específicos para la ventana de impresión */
    extraStyles?: string;
    /** Cerrar automáticamente la ventana después de imprimir (defecto: false) */
    autoClose?: boolean;
    /** Delay en ms antes de disparar window.print() (defecto: 500ms) */
    printDelay?: number;
}

/**
 * Mecanismo Estándar de Impresión Limpia (Golden Print via New Window)
 * 
 * Extrae el HTML del documento y lo renderiza en una ventana completamente limpia
 * sin la contaminación del DOM de la aplicación (sin navbars, sin sidebars, sin modales,
 * sin widgets flotantes de chat/soporte y sin restricciones de h-screen/overflow).
 */
export function printViaNewWindow(options: PrintViaNewWindowOptions): Window | null {
    if (typeof window === 'undefined') return null;

    // 1. Extraer contenido HTML
    let htmlContent = options.content || '';
    if (!htmlContent && options.element) {
        htmlContent = options.element.innerHTML;
    }

    if (!htmlContent) {
        console.warn('printViaNewWindow: No se proporcionó contenido ni elemento para imprimir.');
        return null;
    }

    const paperSize = options.paperSize || 'letter';
    const orientation = options.orientation || 'portrait';
    const title = options.title || 'Documento Oficial - FruFresco';
    const printDelay = options.printDelay ?? 500;
    const autoClose = options.autoClose ?? false;

    // Márgenes por defecto optimizados (0.8cm a 1.2cm)
    const margin = options.margin || (orientation === 'landscape' ? '0.8cm 1.0cm' : '1.1cm 1.3cm');

    // 2. Abrir ventana limpia
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor permite las ventanas emergentes (pop-ups) en tu navegador para generar el documento de impresión.');
        return null;
    }

    // 3. Ensamblar documento HTML estricto sin dependencias externas pesadas
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        /* ========================================================= */
        /* GOLDEN PRINT VIA NEW WINDOW - ISOLATED DOCUMENT STYLES   */
        /* ========================================================= */
        @page {
            size: ${paperSize} ${orientation};
            margin: ${margin};
        }
        *, *::before, *::after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            background-color: #FFFFFF !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #0F172A;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 7.2pt;
            line-height: 1.25;
            -webkit-font-smoothing: antialiased;
        }
        
        /* Limpieza de contenedores para que no arrastren cajas de pantalla */
        .letterhead-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            min-height: auto !important;
            height: auto !important;
            position: static !important;
            background: transparent !important;
            display: block !important;
        }

        .letterhead-top-stripe {
            display: none !important;
        }

        /* Tablas compactas de alta densidad */
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            font-size: 7.2pt !important;
            margin-bottom: 6px !important;
        }
        thead {
            display: table-header-group !important;
        }
        tfoot {
            display: table-row-group !important;
        }
        tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        th {
            font-size: 6.8pt !important;
            font-weight: 800 !important;
            padding: 2.5px 5px !important;
            vertical-align: middle !important;
            text-transform: uppercase !important;
        }
        td {
            font-size: 7.2pt !important;
            padding: 2.5px 5px !important;
            vertical-align: middle !important;
            line-height: 1.22 !important;
        }
        td.num-cell, td.text-right, .tabular-nums {
            font-variant-numeric: tabular-nums !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif !important;
            text-align: right !important;
        }

        /* Reglas de corte y Poka-Yoke */
        .page-break {
            page-break-after: always !important;
            break-after: page !important;
        }
        .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
        .no-print {
            display: none !important;
        }

        /* Quitar cualquier widget flotante o botón que haya quedado */
        button, .chat-widget, [class*="chat"], [class*="floating"] {
            display: none !important;
        }

        ${options.extraStyles || ''}
    </style>
</head>
<body>
    ${htmlContent}
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.focus();
                window.print();
                ${autoClose ? 'setTimeout(function() { window.close(); }, 300);' : ''}
            }, ${printDelay});
        };
    </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    return printWindow;
}

export default printViaNewWindow;
