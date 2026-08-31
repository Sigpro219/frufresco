'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, FileText, Loader2 } from 'lucide-react';

interface PdfCanvasViewerProps {
    file: File | Blob | null;
    fileUrl?: string | null;
}

export default function PdfCanvasViewer({ file, fileUrl }: PdfCanvasViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [zoom, setZoom] = useState<number>(0.95);
    const [pdfDoc, setPdfDoc] = useState<any>(null);

    // 1. Cargar el script de PDF.js si no existe
    useEffect(() => {
        let isMounted = true;

        const loadPdfJs = async () => {
            if (!(window as any).pdfjsLib) {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.async = true;
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
        };

        const initPdf = async () => {
            try {
                setLoading(true);
                setError(null);
                await loadPdfJs();

                let arrayBuffer: ArrayBuffer;
                if (file) {
                    arrayBuffer = await file.arrayBuffer();
                } else if (fileUrl) {
                    const res = await fetch(fileUrl);
                    arrayBuffer = await res.arrayBuffer();
                } else {
                    return;
                }

                const pdf = await (window as any).pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                if (!isMounted) return;
                setPdfDoc(pdf);
                setNumPages(pdf.numPages);
                setLoading(false);
            } catch (err: any) {
                console.error('Error cargando PDF en Canvas:', err);
                if (isMounted) {
                    setError('No se pudo renderizar el PDF en pantalla');
                    setLoading(false);
                }
            }
        };

        if (file || fileUrl) {
            initPdf();
        }

        return () => {
            isMounted = false;
        };
    }, [file, fileUrl]);

    // 2. Renderizar páginas cuando cambia el documento o el zoom
    useEffect(() => {
        if (!pdfDoc || !containerRef.current) return;

        let isCancelled = false;
        const renderPages = async () => {
            const container = containerRef.current;
            if (!container) return;
            container.innerHTML = '';

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                if (isCancelled) break;
                try {
                    const page = await pdfDoc.getPage(pageNum);
                    const pixelRatio = window.devicePixelRatio || 1;
                    const viewport = page.getViewport({ scale: zoom });

                    const pageWrapper = document.createElement('div');
                    pageWrapper.style.marginBottom = '16px';
                    pageWrapper.style.display = 'flex';
                    pageWrapper.style.flexDirection = 'column';
                    pageWrapper.style.alignItems = 'center';
                    pageWrapper.style.position = 'relative';

                    const canvas = document.createElement('canvas');
                    canvas.style.width = `${viewport.width}px`;
                    canvas.style.height = `${viewport.height}px`;
                    canvas.style.maxWidth = '100%';
                    canvas.style.borderRadius = '8px';
                    canvas.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.12)';
                    canvas.style.backgroundColor = '#FFFFFF';

                    canvas.width = viewport.width * pixelRatio;
                    canvas.height = viewport.height * pixelRatio;

                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.scale(pixelRatio, pixelRatio);
                        await page.render({
                            canvasContext: ctx,
                            viewport: viewport
                        }).promise;
                    }

                    const pageLabel = document.createElement('div');
                    pageLabel.innerText = `Página ${pageNum} de ${pdfDoc.numPages}`;
                    pageLabel.style.fontSize = '11px';
                    pageLabel.style.fontWeight = '700';
                    pageLabel.style.color = '#64748B';
                    pageLabel.style.marginTop = '6px';

                    pageWrapper.appendChild(canvas);
                    pageWrapper.appendChild(pageLabel);
                    container.appendChild(pageWrapper);
                } catch (e) {
                    console.warn(`Error renderizando página ${pageNum}:`, e);
                }
            }
        };

        renderPages();

        return () => {
            isCancelled = true;
        };
    }, [pdfDoc, zoom]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '560px', backgroundColor: '#F1F5F9', borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
            {/* Toolbar Superior */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                fontSize: '0.8rem',
                color: '#334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800' }}>
                    <FileText size={14} color="#0D7A57" />
                    <span>{numPages > 0 ? `${numPages} Pág.` : 'Visor PDF'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        type="button"
                        onClick={() => setZoom(prev => Math.max(0.75, prev - 0.2))}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
                        title="Reducir Zoom"
                    >
                        <ZoomOut size={13} />
                    </button>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', minWidth: '42px', textAlign: 'center' }}>
                        {Math.round(zoom * 100)}%
                    </span>
                    <button
                        type="button"
                        onClick={() => setZoom(prev => Math.min(2.5, prev + 0.2))}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
                        title="Aumentar Zoom"
                    >
                        <ZoomIn size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setZoom(1.25)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
                        title="Restablecer Zoom"
                    >
                        <RotateCcw size={13} />
                    </button>
                </div>
            </div>

            {/* Contenedor de Páginas */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: loading ? 'center' : 'flex-start',
                    minHeight: '520px',
                    maxHeight: '600px'
                }}
            >
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#64748B' }}>
                        <Loader2 className="animate-spin" size={26} color="#0D7A57" />
                        <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Cargando documento original...</span>
                    </div>
                )}

                {error && !loading && (
                    <div style={{ color: '#DC2626', fontSize: '0.85rem', fontWeight: '700', textAlign: 'center', padding: '1rem' }}>
                        {error}
                    </div>
                )}

                <div ref={containerRef} style={{ width: '100%', display: loading ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center' }} />
            </div>
        </div>
    );
}
