'use client';

import React, { useState, useRef } from 'react';
import { 
    UniversalLetterhead, 
    INVESTMENTS_CORTES_BRAND, 
    DELTA_CORETECH_BRAND, 
    INGYEMEL_BRAND,
    PaperSize,
    printViaNewWindow
} from '@/components/print';
import { Printer, Building2, Check, Sparkles } from 'lucide-react';

export default function TestLetterheadPage() {
    const [selectedBrandKey, setSelectedBrandKey] = useState<'cortes' | 'delta' | 'ingyemel'>('cortes');
    const [paperSize, setPaperSize] = useState<PaperSize>('letter');
    const printDocRef = useRef<HTMLDivElement>(null);

    const brands = {
        cortes: { name: 'Investments Cortés (FruFresco)', brand: INVESTMENTS_CORTES_BRAND },
        delta: { name: 'Delta CoreTech', brand: DELTA_CORETECH_BRAND },
        ingyemel: { name: 'Ingyemel Mantenimiento', brand: INGYEMEL_BRAND }
    };

    const currentBrand = brands[selectedBrandKey].brand;

    return (
        <div style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', padding: '2rem 1rem 4rem' }}>
            
            {/* Control Panel (Hidden during print) */}
            <div className="no-print" style={{ maxWidth: '850px', margin: '0 auto 2rem', backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Sparkles size={18} color="#0D7A57" />
                            <h2 style={{ color: '#0F172A', margin: 0, fontSize: '1.3rem', fontWeight: 900 }}>
                                Laboratorio de Papelería & Golden Print Modular
                            </h2>
                        </div>
                        <p style={{ color: '#64748B', margin: 0, fontSize: '0.82rem' }}>
                            Motor universal desacoplado aplicable a cualquier empresa del ecosistema con cero dependencias externas.
                        </p>
                    </div>

                    <button 
                        onClick={() => {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: `${brands[selectedBrandKey].name} - Comprobante Oficial`,
                                paperSize
                            });
                        }}
                        style={{ 
                            backgroundColor: '#0D7A57', 
                            color: 'white', 
                            padding: '0.65rem 1.4rem', 
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: '700',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                        }}
                    >
                        <Printer size={16} /> Imprimir Muestra Oficial (Ventana Limpia)
                    </button>
                </div>

                {/* Brand Preset Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '1rem', borderTop: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Empresa / Preset Activo:
                    </span>
                    {(Object.keys(brands) as Array<'cortes' | 'delta' | 'ingyemel'>).map((key) => {
                        const isSelected = selectedBrandKey === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setSelectedBrandKey(key)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: isSelected ? 800 : 600,
                                    border: isSelected ? '1.5px solid #0F172A' : '1px solid #CBD5E1',
                                    backgroundColor: isSelected ? '#0F172A' : '#FFFFFF',
                                    color: isSelected ? '#FFFFFF' : '#334155',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Building2 size={13} />
                                {brands[key].name}
                                {isSelected && <Check size={13} />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Universal Document Container (Wrapped with ref for clean new-window printing) */}
            <div ref={printDocRef}>
                <UniversalLetterhead 
                    brand={currentBrand}
                    paperSize={paperSize}
                meta={{
                    title: "Comprobante y Relación Oficial de Entrega",
                    subtitle: "DIVISIÓN CORPORATIVA & CONTRATOS INSTITUCIONALES",
                    date: "08 de Septiembre, 2026",
                    reference: "DOC-REF-2026-0908",
                    operationalTag: {
                        label: "Bahía de Piso",
                        value: "ESPACIO 21"
                    }
                }}
            >
                <div style={{ padding: '0.5rem 0' }}>
                    {/* Client Information Compact Box */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', backgroundColor: '#F8FAFC', padding: '6px 10px', borderRadius: '5px', border: '1px solid #E2E8F0', fontSize: '0.68rem', marginBottom: '8px' }}>
                        <div>
                            <div><strong>CLIENTE / CONTRATISTA:</strong> RESTAURANTES WOK (LAO KAO S.A.)</div>
                            <div><strong>NIT:</strong> 830.047.537-2 &bull; <strong>TEL:</strong> 630 7872</div>
                            <div><strong>DIRECCIÓN:</strong> CR 65 # 81-15 &bull; Barrios Unidos, Bogotá</div>
                        </div>
                        <div>
                            <div><strong>ORDEN / CONTRATO:</strong> OC 001-OC-00072271</div>
                            <div><strong>FECHA EMISIÓN:</strong> 08/09/2026 &bull; Franja: 05:00 - 08:00 AM</div>
                            <div><strong>ASIGNACIÓN OPERATIVA:</strong> ESPACIO 21 (Muelle Central)</div>
                        </div>
                    </div>

                    <p style={{ margin: '4px 0 6px', fontSize: '0.68rem', color: '#475569' }}>
                        Relación detallada de ítems certificados y despachados bajo estándar de calidad y empaque industrial:
                    </p>

                    {/* Compact Table Example */}
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '5%' }} className="text-center">#</th>
                                <th style={{ width: '15%' }}>Código SKU</th>
                                <th style={{ width: '40%' }}>Descripción del Producto / Servicio</th>
                                <th style={{ width: '10%' }} className="text-right">Cant.</th>
                                <th style={{ width: '8%' }} className="text-center">UM</th>
                                <th style={{ width: '11%' }} className="text-right">Valor Unit.</th>
                                <th style={{ width: '11%' }} className="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="text-center" style={{ color: '#94A3B8', fontWeight: 'bold' }}>01</td>
                                <td style={{ fontFamily: 'monospace', color: '#64748B' }}>FRU-0012</td>
                                <td><strong>Cebolla Cabezona Blanca</strong> <span style={{ fontSize: '0.60rem', color: '#64748B' }}>(Seleccionada Calibre A)</span></td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>40.0</td>
                                <td className="text-center">KG</td>
                                <td className="text-right">$ 3.200</td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>$ 128.000</td>
                            </tr>
                            <tr>
                                <td className="text-center" style={{ color: '#94A3B8', fontWeight: 'bold' }}>02</td>
                                <td style={{ fontFamily: 'monospace', color: '#64748B' }}>FRU-0018</td>
                                <td><strong>Cebolla Cabezona Roja</strong></td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>120.0</td>
                                <td className="text-center">KG</td>
                                <td className="text-right">$ 3.800</td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>$ 456.000</td>
                            </tr>
                            <tr>
                                <td className="text-center" style={{ color: '#94A3B8', fontWeight: 'bold' }}>03</td>
                                <td style={{ fontFamily: 'monospace', color: '#64748B' }}>HRB-0004</td>
                                <td><strong>Cilantro Cimarrón Seleccionado</strong></td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>4.0</td>
                                <td className="text-center">KG</td>
                                <td className="text-right">$ 8.500</td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>$ 34.000</td>
                            </tr>
                            <tr>
                                <td className="text-center" style={{ color: '#94A3B8', fontWeight: 'bold' }}>04</td>
                                <td style={{ fontFamily: 'monospace', color: '#64748B' }}>FRU-0045</td>
                                <td><strong>Jengibre Fresco de Exportación</strong></td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>40.0</td>
                                <td className="text-center">KG</td>
                                <td className="text-right">$ 7.200</td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>$ 288.000</td>
                            </tr>
                            <tr>
                                <td className="text-center" style={{ color: '#94A3B8', fontWeight: 'bold' }}>05</td>
                                <td style={{ fontFamily: 'monospace', color: '#64748B' }}>FRU-0110</td>
                                <td><strong>Mango Filipino Maduro</strong></td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>140.0</td>
                                <td className="text-center">KG</td>
                                <td className="text-right">$ 5.400</td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>$ 756.000</td>
                            </tr>
                            <tr>
                                <td className="text-center" style={{ color: '#94A3B8', fontWeight: 'bold' }}>06</td>
                                <td style={{ fontFamily: 'monospace', color: '#64748B' }}>FRU-0132</td>
                                <td><strong>Manzana Nacional Seleccionada</strong></td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>40.0</td>
                                <td className="text-center">KG</td>
                                <td className="text-right">$ 6.100</td>
                                <td className="text-right" style={{ fontWeight: 'bold' }}>$ 244.000</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Financial Summary Compact Box */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                        <div style={{ width: '240px', backgroundColor: '#F8FAFC', padding: '6px 10px', borderRadius: '5px', border: '1px solid #E2E8F0', fontSize: '0.68rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                <span>Subtotal Gravable:</span>
                                <span style={{ fontWeight: 'bold', color: '#0F172A' }}>$ 1.906.000</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                <span>Impuestos (IVA 0% Alimentos):</span>
                                <span style={{ fontWeight: 'bold', color: '#0F172A' }}>$ 0</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #0F172A', paddingTop: '3px', fontSize: '0.82rem', fontWeight: 900 }}>
                                <span>TOTAL A PAGAR:</span>
                                <span style={{ color: currentBrand.accentColor || '#0D7A57' }}>$ 1.906.000</span>
                            </div>
                        </div>
                    </div>

                    {/* Signatures & Certification */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid #E2E8F0', fontSize: '0.66rem' }}>
                        <div>
                            <div style={{ borderBottom: '1px solid #0F172A', width: '220px', height: '24px' }}></div>
                            <div style={{ marginTop: '4px' }}><strong>Gerencia General / Despachos</strong></div>
                            <div style={{ color: '#64748B' }}>{currentBrand.companyName}</div>
                        </div>
                        <div>
                            <div style={{ borderBottom: '1px solid #0F172A', width: '220px', height: '24px' }}></div>
                            <div style={{ marginTop: '4px' }}><strong>Recibido a Conformidad Cliente</strong></div>
                            <div style={{ color: '#64748B' }}>Firma, Cédula y Sello de Recepción</div>
                        </div>
                    </div>
                </div>
            </UniversalLetterhead>
            </div>
        </div>
    );
}
