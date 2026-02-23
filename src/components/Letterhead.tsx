'use client';

import React from 'react';

interface LetterheadProps {
    children: React.ReactNode;
    title?: string;
    date?: string;
    reference?: string;
}

export default function Letterhead({ children, title, date, reference }: LetterheadProps) {
    return (
        <div className="letterhead-container">
            <style jsx>{`
                .letterhead-container {
                    background-color: white;
                    color: #1a1a1a;
                    font-family: 'Inter', sans-serif;
                    width: 210mm; /* A4 width */
                    min-height: 297mm; /* A4 height */
                    margin: 2rem auto;
                    padding: 20mm;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    position: relative;
                    display: flex;
                    flex-direction: column;
                }

                .letterhead-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #1e3a8a;
                    padding-bottom: 0.5rem;
                    margin-bottom: 1.5rem;
                }

                .logo-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .company-info {
                    text-align: right;
                    font-size: 0.8rem;
                    color: #4b5563;
                    line-height: 1.4;
                }

                .company-name {
                    font-weight: 800;
                    color: #111827;
                    font-size: 1.1rem;
                    text-transform: uppercase;
                    margin-bottom: 0.25rem;
                }

                .document-body {
                    flex-grow: 1;
                    font-size: 1rem;
                    line-height: 1.6;
                    color: #374151;
                }

                .document-meta {
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.9rem;
                    color: #6b7280;
                }

                .document-title {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #111827;
                    margin-bottom: 1.5rem;
                    text-align: center;
                }

                .letterhead-footer {
                    margin-top: 3rem;
                    border-top: 1px solid #f3f4f6;
                    padding-top: 1.5rem;
                    font-size: 0.75rem;
                    color: #9ca3af;
                    text-align: center;
                }

                @media print {
                    @page {
                        margin: 10mm;
                    }

                    /* 1. Global Reset: Hide EVERYTHING by default */
                    body, html {
                        visibility: hidden !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    
                    /* 2. Hide specific Next.js main wrappers just in case */
                    body > *:not(.letterhead-container),
                    nav, 
                    footer, 
                    .navbar, 
                    .global-banner, 
                    header:not(.letterhead-header),
                    #root > *:not(.letterhead-container),
                    #__next > *:not(.letterhead-container),
                    main:not(.document-body) {
                        display: none !important;
                        height: 0 !important;
                        width: 0 !important;
                        overflow: hidden !important;
                        position: absolute !important;
                        opacity: 0 !important;
                        visibility: hidden !important;
                    }

                    /* 3. Make the Letterhead and its children the ONLY visible things */
                    .letterhead-container, .letterhead-container * {
                        visibility: visible !important;
                    }

                    /* 4. Position the letterhead to take over the document flow */
                    .letterhead-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        background: white;
                        display: block;
                    }

                    /* 5. Ensure breaks are handled */
                    .letterhead-header, .letterhead-footer {
                        break-inside: avoid;
                    }
                }
            `}</style>

            <header className="letterhead-header">
                <div className="logo-section">
                    <img 
                        src="/assets/branding/logo_corporate.png?v=3" 
                        alt="Investments Cortes Logo" 
                        style={{ height: '120px', width: 'auto', objectFit: 'contain' }}
                    />
                </div>
                <div className="company-info" suppressHydrationWarning>
                    <div className="company-name">Investments Cortes S.A.S</div>
                    <div>NIT: 901.393.217</div>
                    <div>CL 12 B # 71 D - 31 TO 4 AP 101</div>
                    <div>Bogotá D.C., Colombia</div>
                    <div>contacto@investmentscortes.com</div>
                </div>
            </header>

            <main className="document-body">
                {(date || reference) && (
                    <div className="document-meta">
                        <div>{date && <span>Fecha: {date}</span>}</div>
                        <div>{reference && <span>Ref: {reference}</span>}</div>
                    </div>
                )}

                {title && <h1 className="document-title">{title}</h1>}

                <div className="content">
                    {children}
                </div>
            </main>

            <footer className="letterhead-footer">
                <p>Este documento es propiedad de Investments Cortes S.A.S. Prohibida su reproducción total o parcial sin autorización.</p>
                <div style={{ marginTop: '0.5rem', fontWeight: 600 }}>CORTESÍA • CALIDAD • COMPROMISO</div>
            </footer>
        </div>
    );
}
