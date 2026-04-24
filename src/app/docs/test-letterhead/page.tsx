'use client';

import React from 'react';
import Letterhead from '@/components/Letterhead';

export default function TestLetterheadPage() {
    return (
        <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh', paddingBottom: '4rem' }}>
            
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2 style={{ color: '#374151', marginBottom: '1rem' }}>Papel Membretado Oficial</h2>
                <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
                    Esta es la plantilla base para cualquier documento de la empresa.
                    El contenido es totalmente libre.
                </p>
                
                <button 
                    onClick={() => window.print()}
                    className="btn"
                    style={{ 
                        backgroundColor: 'var(--primary)', 
                        color: 'white', 
                        padding: '0.75rem 1.5rem', 
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                >
                    🖨️ Imprimir Documento
                </button>
            </div>

            <Letterhead 
                date="18 de Febrero, 2026"
                reference="REF-GRAL-001"
            >
                <div style={{ padding: '2rem 0' }}>
                    <p style={{ marginBottom: '1.5rem' }}><strong>Estimado Cliente/Proveedor:</strong></p>
                    
                    <p style={{ marginBottom: '1rem' }}>
                        Por medio de la presente, queremos informarle que este documento ha sido generado utilizando nuestra nueva
                        plantilla oficial de comunicaciones. El objetivo es mantener una imagen corporativa unificada y profesional
                        en todas nuestras interacciones.
                    </p>

                    <p style={{ marginBottom: '1rem' }}>
                        Este espacio está diseñado para recibir cualquier tipo de contenido:
                    </p>

                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
                        <li>Cartas formales y comunicados.</li>
                        <li>Reportes e informes técnicos.</li>
                        <li>Contratos y acuerdos legales.</li>
                        <li>Cualquier texto que requiera el respaldo de nuestra marca.</li>
                    </ul>

                    <p style={{ marginBottom: '2rem' }}>
                        Agradecemos su atención y quedamos a su disposición para cualquier consulta adicional.
                    </p>

                    <p>Atentamente,</p>
                    
                    <div style={{ marginTop: '3rem', borderTop: '1px solid #000', width: '250px', paddingTop: '0.5rem' }}>
                        <strong>Gerencia General</strong><br/>
                        <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>Investments Cortes S.A.S</span>
                    </div>
                </div>
            </Letterhead>
        </div>
    );
}

