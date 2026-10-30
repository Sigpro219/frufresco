'use client';

import {
    acquireSaveFileHandle,
    isSavePickerAborted,
    writeBlobToHandleOrFallback,
} from '@/lib/fileSavePicker';

export type DirectPdfDocKey =
    | 'alistamiento'
    | 'purchases'
    | 'receiving'
    | 'inventory'
    | 'labels'
    | 'manifest'
    | 'contingency';

interface PdfPageSpec {
    orientation: 'portrait' | 'landscape';
    widthMm: number;
    heightMm: number;
    marginXMm: number;
    marginYMm: number;
    defaultPrefix: string;
}

const PDF_PAGE_SPECS: Record<DirectPdfDocKey, PdfPageSpec> = {
    alistamiento: {
        orientation: 'landscape',
        widthMm: 355.6,
        heightMm: 215.9,
        marginXMm: 7,
        marginYMm: 6,
        defaultPrefix: 'Sabana_Alistamiento_Oficio',
    },
    purchases: {
        orientation: 'portrait',
        widthMm: 215.9,
        heightMm: 330,
        marginXMm: 5,
        marginYMm: 5,
        defaultPrefix: 'Planillas_Compras_Corabastos',
    },
    receiving: {
        orientation: 'portrait',
        widthMm: 215.9,
        heightMm: 330,
        marginXMm: 5,
        marginYMm: 5,
        defaultPrefix: 'Control_Ingreso_Bascula',
    },
    inventory: {
        orientation: 'portrait',
        widthMm: 215.9,
        heightMm: 279.4,
        marginXMm: 5,
        marginYMm: 5,
        defaultPrefix: 'Toma_Fisica_Inventario',
    },
    labels: {
        orientation: 'landscape',
        widthMm: 100,
        heightMm: 50,
        marginXMm: 0,
        marginYMm: 0,
        defaultPrefix: 'Rotulos_Termicos_100x50',
    },
    manifest: {
        orientation: 'portrait',
        widthMm: 215.9,
        heightMm: 330,
        marginXMm: 6,
        marginYMm: 6,
        defaultPrefix: 'Manifiesto_Despacho_Ruta',
    },
    contingency: {
        orientation: 'portrait',
        widthMm: 215.9,
        heightMm: 279.4,
        marginXMm: 5,
        marginYMm: 5,
        defaultPrefix: 'Remisiones_Entrega',
    },
};

export function getSuggestedPdfFileName(docType: DirectPdfDocKey, selectedDate?: string): string {
    const spec = PDF_PAGE_SPECS[docType] || PDF_PAGE_SPECS.purchases;
    const cleanDate = selectedDate || new Date().toISOString().slice(0, 10);
    return `${spec.defaultPrefix}_${cleanDate}.pdf`;
}

/**
 * Encuentra todas las hojas imprimibles dentro de un contenedor DOM.
 */
function findPrintableSheets(root: ParentNode): HTMLElement[] {
    const selectors = [
        '.print-sheet',
        '.letterhead-container',
        '.label-container',
        '.page-break',
    ];

    for (const sel of selectors) {
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
            (el) => el.getBoundingClientRect().height > 20 && !el.closest('.no-print')
        );
        if (nodes.length > 0) {
            return nodes;
        }
    }

    const fallback = root.querySelector<HTMLElement>(
        '.print-doc-container, .print-doc-wrapper, main'
    );
    return fallback ? [fallback] : [];
}

/**
 * Renderiza las hojas del DOM en un documento jsPDF multipágina y retorna el Blob PDF.
 */
export async function generatePdfBlobFromDom(
    root: ParentNode,
    docType: DirectPdfDocKey,
    onProgress?: (current: number, total: number) => void
): Promise<Blob> {
    const [{ jsPDF }, html2canvasModule] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
    ]);
    const html2canvas = html2canvasModule.default || (html2canvasModule as any);

    const spec = PDF_PAGE_SPECS[docType] || PDF_PAGE_SPECS.purchases;
    const sheets = findPrintableSheets(root);

    if (sheets.length === 0) {
        throw new Error('No hay páginas o registros cargados en el documento para exportar a PDF.');
    }

    const pdf = new jsPDF({
        orientation: spec.orientation,
        unit: 'mm',
        format: [spec.widthMm, spec.heightMm],
        compress: true,
    });

    const availW = spec.widthMm - spec.marginXMm * 2;
    const availH = spec.heightMm - spec.marginYMm * 2;

    for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        onProgress?.(i + 1, sheets.length);

        // Guardar estilos temporales para eliminar sombras/bordes de vista previa durante la captura
        const prevBoxShadow = sheet.style.boxShadow;
        const prevMargin = sheet.style.margin;
        sheet.style.boxShadow = 'none';

        try {
            const canvas = await html2canvas(sheet, {
                scale: docType === 'labels' ? 3 : 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#FFFFFF',
                logging: false,
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgAspect = canvas.width / canvas.height;

            let renderW = availW;
            let renderH = renderW / imgAspect;

            // Si la hoja individual excede ligeramente el alto útil, escalar proporcionalmente para evitar cortes
            if (renderH > availH) {
                renderH = availH;
                renderW = renderH * imgAspect;
            }

            const offsetX = spec.marginXMm + Math.max(0, (availW - renderW) / 2);
            const offsetY = spec.marginYMm;

            if (i > 0) {
                pdf.addPage([spec.widthMm, spec.heightMm], spec.orientation);
            }

            pdf.addImage(imgData, 'JPEG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
        } finally {
            sheet.style.boxShadow = prevBoxShadow;
            sheet.style.margin = prevMargin;
        }
    }

    return pdf.output('blob');
}

/**
 * Guarda directamente el documento actual en pantalla como archivo PDF,
 * abriendo SIEMPRE primero la ventana "Guardar como..." del sistema operativo.
 */
export async function saveCurrentPageAsPdfDirect(options: {
    docType: DirectPdfDocKey;
    selectedDate?: string;
    suggestedName?: string;
    rootElement?: ParentNode | null;
    onProgress?: (current: number, total: number) => void;
}): Promise<boolean> {
    const fileName =
        options.suggestedName || getSuggestedPdfFileName(options.docType, options.selectedDate);
    const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

    try {
        // 1. Abrir INMEDIATAMENTE el selector de carpetas nativo ("Guardar como...") mientras el gesto de clic está activo
        const fileHandle = await acquireSaveFileHandle({
            suggestedName: cleanFileName,
            description: 'Documento PDF (.pdf)',
            mimeType: 'application/pdf',
            extension: '.pdf',
        });

        // 2. Generar el Blob PDF desde las hojas renderizadas en el DOM
        const root = options.rootElement || document;
        const pdfBlob = await generatePdfBlobFromDom(root, options.docType, options.onProgress);

        // 3. Escribir el archivo en la ubicación elegida por el usuario
        await writeBlobToHandleOrFallback(pdfBlob, cleanFileName, fileHandle);
        return true;
    } catch (err) {
        if (isSavePickerAborted(err)) {
            return false;
        }
        throw err;
    }
}

/**
 * Carga una ruta de documento imprimible en segundo plano (iframe oculto),
 * preguntando INMEDIATAMENTE al usuario dónde guardar el archivo PDF ("Guardar como..."),
 * y escribe el PDF resultante directamente en el disco sin abrir ventana de impresora.
 */
export async function saveRemotePrintUrlAsPdfDirect(options: {
    url: string;
    docType: DirectPdfDocKey;
    selectedDate?: string;
    suggestedName?: string;
    beforeLoad?: () => Promise<any>;
    onProgress?: (statusText: string) => void;
}): Promise<boolean> {
    const fileName =
        options.suggestedName || getSuggestedPdfFileName(options.docType, options.selectedDate);
    const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

    let iframe: HTMLIFrameElement | null = null;

    try {
        // 1. Abrir INMEDIATAMENTE el diálogo "Guardar como..." antes de cualquier espera asíncrona
        const fileHandle = await acquireSaveFileHandle({
            suggestedName: cleanFileName,
            description: 'Documento PDF (.pdf)',
            mimeType: 'application/pdf',
            extension: '.pdf',
        });

        if (options.beforeLoad) {
            options.onProgress?.('Sincronizando...');
            await options.beforeLoad();
        }

        options.onProgress?.('Cargando documento...');

        // 2. Montar iframe fuera de pantalla para renderizar el documento oficial
        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '0';
        iframe.style.width = options.docType === 'alistamiento' ? '1450px' : '1050px';
        iframe.style.height = '1200px';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        iframe.style.border = 'none';
        iframe.src = options.url;
        document.body.appendChild(iframe);

        // 3. Esperar a que las hojas imprimibles terminen de renderizarse en el iframe
        const iframeDoc = await new Promise<Document>((resolve, reject) => {
            const startTime = Date.now();
            const timeoutMs = 25000;

            const checkReady = () => {
                if (!iframe) {
                    reject(new Error('Iframe cancelado.'));
                    return;
                }
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc) {
                    const sheets = findPrintableSheets(doc);
                    if (sheets.length > 0) {
                        // Dar 450ms adicionales para fuentes/imágenes/QR
                        setTimeout(() => resolve(doc), 450);
                        return;
                    }
                }
                if (Date.now() - startTime > timeoutMs) {
                    reject(
                        new Error(
                            'Tiempo de espera agotado o no existen registros para esta fecha en el documento seleccionado.'
                        )
                    );
                    return;
                }
                setTimeout(checkReady, 250);
            };

            setTimeout(checkReady, 350);
        });

        // 4. Generar PDF multipágina desde el DOM del iframe
        const pdfBlob = await generatePdfBlobFromDom(iframeDoc, options.docType, (curr, total) => {
            options.onProgress?.(`PDF (${curr}/${total})...`);
        });

        // 5. Guardar en la ruta elegida por el usuario
        options.onProgress?.('Guardando...');
        await writeBlobToHandleOrFallback(pdfBlob, cleanFileName, fileHandle);
        return true;
    } catch (err) {
        if (isSavePickerAborted(err)) {
            return false;
        }
        throw err;
    } finally {
        if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    }
}
