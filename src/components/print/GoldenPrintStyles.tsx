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
    const pageMargin = paperSize === 'a4' 
        ? '1.2cm 1.4cm 1.4cm 1.4cm' 
        : '1.1cm 1.3cm 1.3cm 1.3cm';

    const pageSize = paperSize === 'a4' ? 'a4 portrait' : 'letter portrait';
    const previewWidth = paperSize === 'a4' ? '210mm' : '215.9mm';
    const previewMinHeight = paperSize === 'a4' ? '297mm' : '279.4mm';

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

            .letterhead-header {
                position: relative;
                z-index: 1;
                border-bottom: 2px solid var(--print-primary);
                padding-bottom: 0.65rem;
                margin-bottom: 0.75rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
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
                gap: 12px;
                flex-shrink: 0;
            }

            .letterhead-company-name {
                font-size: 1.02rem;
                font-weight: 850;
                color: var(--print-primary);
                letter-spacing: 0.035em;
                text-transform: uppercase;
                white-space: nowrap;
                margin-bottom: 2px;
                line-height: 1.15;
            }

            .letterhead-company-nit {
                font-weight: 750;
                color: #1E293B;
                font-size: 0.70rem;
                letter-spacing: 0.02em;
                white-space: nowrap;
                line-height: 1.2;
            }

            .letterhead-company-info {
                text-align: right;
                font-size: 0.63rem;
                color: #475569;
                line-height: 1.35;
                flex-shrink: 0;
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
                padding: 5px 10px;
                margin-bottom: 0.65rem;
                font-size: 0.72rem;
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
                border-top: 1px solid #E2E8F0;
                padding-top: 0.45rem;
                font-size: 0.58rem;
                color: #64748B;
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
                }
                .no-print {
                    display: none !important;
                }
                .letterhead-container {
                    width: 100% !important;
                    min-height: auto !important;
                    height: auto !important;
                    position: static !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    page-break-after: auto !important;
                    break-after: auto !important;
                }
                .page-break {
                    page-break-after: always !important;
                    break-after: page !important;
                }
                .letterhead-top-stripe {
                    display: none !important;
                }
            }
        ` }} />
    );
}
