'use client';

import React from 'react';
import { PaperSize } from './types';

interface GoldenPrintStylesProps {
    paperSize?: PaperSize;
    primaryColor?: string;
    accentColor?: string;
}

export default function GoldenPrintStyles({
    paperSize = 'letter',
    primaryColor = '#0F172A',
    accentColor = '#0D7A57'
}: GoldenPrintStylesProps) {
    const isOficioOrLegal = paperSize === 'oficio' || paperSize === 'legal';
    const pageMargin = paperSize === 'a4' 
        ? '1.2cm 1.4cm 1.4cm 1.4cm' 
        : isOficioOrLegal
        ? '0.8cm 1.0cm 1.0cm 1.0cm'
        : '1.1cm 1.3cm 1.3cm 1.3cm';

    const pageSize = paperSize === 'a4' 
        ? 'a4 portrait' 
        : isOficioOrLegal
        ? 'legal portrait'
        : 'letter portrait';

    const previewWidth = paperSize === 'a4' ? '210mm' : '215.9mm';
    const previewMinHeight = paperSize === 'a4' 
        ? '297mm' 
        : paperSize === 'oficio'
        ? '330mm'
        : paperSize === 'legal'
        ? '355.6mm'
        : '279.4mm';

    return (
        <style dangerouslySetInnerHTML={{ __html: `
            :root {
                --print-primary: ${primaryColor};
                --print-accent: ${accentColor};
            }

            .letterhead-container {
                background-color: #FFFFFF;
                color: #0F172A;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                width: ${previewWidth};
                min-height: ${previewMinHeight};
                margin: 1.5rem auto;
                padding: ${pageMargin};
                box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05);
                border: 1px solid #CBD5E1;
                position: relative;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
                page-break-inside: avoid;
                break-inside: avoid;
                overflow: hidden;
            }

            .letterhead-top-stripe {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3.5px;
                background: linear-gradient(90deg, var(--print-accent) 0%, var(--print-primary) 50%, #D97706 100%);
            }

            .letterhead-watermark {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* Si el documento contiene tablas de datos densas, eliminar la marca de agua para evitar efecto cebra y ruido */
            .letterhead-container:has(table) .letterhead-watermark {
                display: none !important;
            }

            .letterhead-header {
                position: relative;
                z-index: 1;
                border-bottom: 2px solid var(--print-primary);
                padding-bottom: 0.5rem;
                margin-bottom: 0.6rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                width: 100%;
                box-sizing: border-box;
            }

            .letterhead-header::after {
                content: "";
                position: absolute;
                bottom: -3.5px;
                left: 0;
                right: 0;
                height: 1px;
                background-color: #CBD5E1;
            }

            .letterhead-logo-wrap {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-shrink: 0;
            }

            .letterhead-company-name {
                font-size: 1.05rem;
                font-weight: 900;
                color: var(--print-primary);
                letter-spacing: 0.02em;
                text-transform: uppercase;
                white-space: nowrap;
                margin-bottom: 1px;
                line-height: 1.15;
            }

            .letterhead-company-nit {
                font-weight: 750;
                color: #1E293B;
                font-size: 0.72rem;
                letter-spacing: 0.01em;
                white-space: nowrap;
                line-height: 1.2;
            }

            .letterhead-company-info {
                text-align: right;
                font-size: 0.68rem;
                color: #475569;
                line-height: 1.3;
                flex-shrink: 0;
                white-space: nowrap;
            }

            .letterhead-meta-strip {
                position: relative;
                z-index: 1;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background-color: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-left: 3.5px solid var(--print-accent);
                border-radius: 4px;
                padding: 4px 8px;
                margin-bottom: 0.55rem;
                font-size: 0.70rem;
                width: 100%;
                box-sizing: border-box;
            }

            /* ========================================================= */
            /* REGLAS IMPERATIVAS: TABLAS SIEMPRE COMPACTAS Y DENSAS    */
            /* ========================================================= */
            .letterhead-container table {
                width: 100% !important;
                border-collapse: collapse !important;
                margin-top: 0.35rem !important;
                margin-bottom: 0.55rem !important;
                font-size: 7.2pt !important;
                line-height: 1.2 !important;
                position: relative;
                z-index: 1;
            }

            .letterhead-container thead {
                display: table-header-group !important;
            }

            .letterhead-container tfoot {
                display: table-row-group !important;
            }

            .letterhead-container tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }

            .letterhead-container th {
                background-color: var(--print-primary) !important;
                color: #FFFFFF !important;
                font-size: 6.8pt !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                padding: 2.5px 5px !important;
                border: 1px solid var(--print-primary) !important;
                text-align: left !important;
                vertical-align: middle !important;
            }

            .letterhead-container th.text-center,
            .letterhead-container th.center,
            .letterhead-container th[align="center"] {
                text-align: center !important;
            }

            .letterhead-container th.text-right,
            .letterhead-container th.right,
            .letterhead-container th[align="right"] {
                text-align: right !important;
            }

            .letterhead-container td {
                padding: 2.5px 5px !important;
                font-size: 7.2pt !important;
                border-bottom: 1px solid #E2E8F0 !important;
                border-left: 1px solid #F1F5F9 !important;
                border-right: 1px solid #F1F5F9 !important;
                color: #1E293B !important;
                vertical-align: middle !important;
                line-height: 1.22 !important;
            }

            .letterhead-container tbody tr:nth-child(even) {
                background-color: #F8FAFC !important;
            }

            .letterhead-container tbody tr:hover {
                background-color: #F1F5F9 !important;
            }

            .letterhead-container td.text-right,
            .letterhead-container td.num-cell,
            .letterhead-container td.right,
            .letterhead-container td[align="right"] {
                font-variant-numeric: tabular-nums !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif !important;
                text-align: right !important;
            }

            .letterhead-container td.text-center,
            .letterhead-container td.center,
            .letterhead-container td[align="center"] {
                text-align: center !important;
            }

            .letterhead-footer {
                position: relative;
                z-index: 1;
                margin-top: auto;
                border-top: 1px solid #CBD5E1;
                padding-top: 0.55rem;
                font-size: 0.72rem;
                color: #475569;
                text-align: center;
                line-height: 1.35;
            }

            /* ========================================================= */
            /* PRINT CSS ENFORCEMENT (REF-2026-08-27-04 GOLDEN PRINT)    */
            /* ========================================================= */
            @media print {
                @page {
                    size: ${pageSize};
                    margin: ${pageMargin};
                }
                body, html {
                    background: white !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color: #000 !important;
                    font-size: 9pt !important;
                }
                .no-print {
                    display: none !important;
                }
                .letterhead-container {
                    width: 100% !important;
                    min-height: calc(100vh - 4px) !important;
                    height: auto !important;
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-between !important;
                    position: relative !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    box-sizing: border-box !important;
                    page-break-after: auto !important;
                    break-after: auto !important;
                }
                .letterhead-container main {
                    flex-grow: 1 !important;
                    display: flex !important;
                    flex-direction: column !important;
                }
                .letterhead-header {
                    width: 100% !important;
                    box-sizing: border-box !important;
                    padding-bottom: 4px !important;
                    margin-bottom: 5px !important;
                }
                .letterhead-company-name {
                    font-size: 11pt !important;
                    font-weight: 900 !important;
                }
                .letterhead-company-nit {
                    font-size: 7.5pt !important;
                    font-weight: 700 !important;
                }
                .letterhead-company-info {
                    font-size: 7pt !important;
                    line-height: 1.25 !important;
                    white-space: nowrap !important;
                }
                .letterhead-meta-strip {
                    font-size: 7.5pt !important;
                    padding: 3px 6px !important;
                    margin-bottom: 5px !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                }
                .letterhead-footer {
                    margin-top: auto !important;
                    border-top: 1px solid #CBD5E1 !important;
                    padding-top: 6px !important;
                    font-size: 8pt !important;
                    color: #334155 !important;
                    line-height: 1.35 !important;
                }
                .letterhead-container table {
                    font-size: 8.5pt !important;
                }
                .letterhead-container th {
                    font-size: 8pt !important;
                    padding: 4px 6px !important;
                }
                .letterhead-container td {
                    font-size: 8.5pt !important;
                    padding: 4px 6px !important;
                }
                .page-break {
                    page-break-after: always !important;
                    break-after: page !important;
                }
                .page-break:last-child {
                    page-break-after: avoid !important;
                    break-after: avoid !important;
                }
                .letterhead-top-stripe {
                    display: none !important;
                }
            }
        ` }} />
    );
}
