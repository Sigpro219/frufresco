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
                    margin: 1rem auto;
                    padding: 12mm 15mm;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    position: relative;
                    display: flex;
                    flex-direction: column;
                }

                .letterhead-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #0D7A57;
                    padding-bottom: 0.4rem;
                    margin-bottom: 0.85rem;
                }

                .logo-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }

                .company-info {
                    text-align: right;
                    font-size: 0.76rem;
                    color: #4b5563;
                    line-height: 1.3;
                }

                .company-name {
                    font-weight: 800;
                    color: #111827;
                    font-size: 1rem;
                    text-transform: uppercase;
                    margin-bottom: 0.15rem;
                }

                .document-body {
                    flex-grow: 1;
                    font-size: 0.88rem;
                    line-height: 1.4;
                    color: #374151;
                }

                .document-meta {
                    margin-bottom: 0.85rem;
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.85rem;
                    color: #6b7280;
                    font-weight: 600;
                }

                .document-title {
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: #111827;
                    margin-bottom: 0.85rem;
                    text-align: center;
                    letter-spacing: -0.02em;
                }

                .letterhead-footer {
                    margin-top: 1.5rem;
                    border-top: 1px solid #f3f4f6;
                    padding-top: 0.75rem;
                    font-size: 0.7rem;
                    color: #9ca3af;
                    text-align: center;
                }

                @media print {
                    @page {
                        margin: 8mm 10mm;
                    }

                    body, html {
                        visibility: hidden !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    
                    footer, .footer, #footer, .letterhead-footer, .global-banner {
                        display: none !important;
                    }

                    body > *:not(.letterhead-container),
                    nav, 
                    .navbar, 
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

                    .letterhead-container, .letterhead-container * {
                        visibility: visible !important;
                    }

                    .letterhead-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        background: white;
                        display: block;
                        box-shadow: none !important;
                    }

                    .letterhead-header {
                        break-inside: avoid;
                    }
                }
            `}</style>

            <header className="letterhead-header">
                <div className="logo-section">
                    <img 
                        src="/logo-investments.png" 
                        alt="Investments Cortes Logo" 
                        style={{ height: '55px', width: 'auto', objectFit: 'contain' }}
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
        </div>
    );
}
