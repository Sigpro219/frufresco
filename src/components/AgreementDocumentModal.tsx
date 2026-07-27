'use client';

import React from 'react';
import Letterhead from './Letterhead';
import { X, Printer, Rocket, Tag, Calendar, Building2, CheckCircle2, FileText } from 'lucide-react';

interface AgreementItem {
    id?: string;
    product_id?: string;
    product_name?: string;
    unit_price: number;
    margin_percent?: number;
    products?: {
        id?: string;
        name?: string;
        name_en?: string;
        unit_of_measure?: string;
        sku?: string;
        base_price?: number;
        image_url?: string;
    };
}

interface AgreementDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreement: any | null;
    clientProfile: any | null;
}

export default function AgreementDocumentModal({
    isOpen,
    onClose,
    agreement,
    clientProfile
}: AgreementDocumentModalProps) {
    if (!isOpen || !agreement) return null;

    const items: AgreementItem[] = agreement.quote_items || [];
    
    const formatPrice = (val: number | string | null | undefined): string => {
        const num = Math.round(Number(val) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const createdDate = agreement.created_at
        ? new Date(agreement.created_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
          })
        : 'Fecha N/A';

    const validUntilDate = agreement.valid_until
        ? new Date(agreement.valid_until).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
          })
        : 'Vigencia Continua (Renovación Trimestral)';

    const refCode = agreement.quote_number
        ? `ACU-${agreement.quote_number}`
        : `ACU-${agreement.id.substring(0, 8).toUpperCase()}`;

    // Compute average savings percentage
    let totalSavingsSum = 0;
    let validSavingsCount = 0;

    items.forEach(it => {
        const basePrice = Number(it.products?.base_price || 0);
        const uPrice = Number(it.unit_price || 0);
        if (basePrice > 0 && uPrice > 0 && basePrice > uPrice) {
            const pct = ((basePrice - uPrice) / basePrice) * 100;
            totalSavingsSum += pct;
            validSavingsCount++;
        }
    });

    const avgSavingsPct = validSavingsCount > 0 ? (totalSavingsSum / validSavingsCount).toFixed(1) : '15.0';

    const handlePrint = () => {
        if (typeof window !== 'undefined') {
            window.print();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div 
                id="printable-agreement-modal"
                style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '900px',
                    maxHeight: '92vh',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    fontFamily: 'var(--font-outfit), sans-serif'
                }}
            >
                {/* Header Control Toolbar (Hidden during print) */}
                <div 
                    className="no-print"
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '1rem 1.5rem',
                        backgroundColor: '#0F172A',
                        color: 'white'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Rocket size={20} color="#10B981" />
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                            Documento Oficial de Acuerdo Comercial Institucional
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                            onClick={handlePrint}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: '#10B981',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                fontWeight: 800,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                            }}
                        >
                            <Printer size={15} /> Imprimir / PDF
                        </button>

                        <button
                            onClick={onClose}
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                color: '#94A3B8',
                                border: 'none',
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Document Body (Printable Area) */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '2.5rem',
                    backgroundColor: '#FFFFFF'
                }}>
                    <Letterhead title="ACUERDO COMERCIAL INSTITUCIONAL DE PRECIOS PREFERENCIALES" reference={refCode} date={createdDate}>
                        <div style={{ margin: '1rem 0 1.5rem', borderBottom: '2px solid #E2E8F0', paddingBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#DCFCE7',
                                        color: '#15803D',
                                        fontWeight: '800',
                                        fontSize: '0.72rem',
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: '6px'
                                    }}>
                                        <CheckCircle2 size={12} /> ACUERDO VIGENTE Y ACTIVO
                                    </span>
                                    <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em' }}>
                                        {agreement.model_snapshot_name || 'Tarifa Especial Convenio Institucional'}
                                    </h1>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0D7A57', fontFamily: 'monospace' }}>
                                        {refCode}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>
                                        Emisión: <strong>{createdDate}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Client & Agreement Meta Box */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '1rem',
                            backgroundColor: '#F8FAFC',
                            padding: '1.25rem',
                            borderRadius: '14px',
                            border: '1px solid #E2E8F0',
                            marginBottom: '1.5rem'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Building2 size={13} color="#0D7A57" /> Cliente Institucional:
                                </span>
                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0F172A', marginTop: '2px' }}>
                                    {clientProfile?.company_name || agreement.client_name || 'Cliente Registrado'}
                                </div>
                                {clientProfile?.nit && (
                                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600', marginTop: '1px' }}>
                                        NIT / CC: {clientProfile.nit}
                                    </div>
                                )}
                            </div>

                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Calendar size={13} color="#0D7A57" /> Vigencia Comercial:
                                </span>
                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0F172A', marginTop: '2px' }}>
                                    {validUntilDate}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#15803D', fontWeight: '700', marginTop: '1px' }}>
                                    🟢 Garantía de Precio Institucional
                                </div>
                            </div>

                            <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Tag size={13} color="#0D7A57" /> Beneficios del Convenio:
                                </span>
                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0D7A57', marginTop: '2px' }}>
                                    {items.length} Productos Negociados
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600', marginTop: '1px' }}>
                                    ~{avgSavingsPct}% Ahorro promedio estimado
                                </div>
                            </div>
                        </div>

                        {/* Products Table */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={18} color="#0D7A57" /> Portafolio de Insumos Incluidos en el Convenio
                            </h3>

                            <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F1F5F9', color: '#475569', textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                                            <th style={{ padding: '0.75rem 1rem' }}>#</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Insumo / Producto</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Unidad</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio Lista Base</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio Pactado Convenio</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Ahorro Garantizado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((it, idx) => {
                                            const p = it.products;
                                            const name = it.product_name || p?.name || 'Producto';
                                            const unit = p?.unit_of_measure || 'Kg';
                                            const basePrice = Number(p?.base_price || 0);
                                            const uPrice = Number(it.unit_price || 0);
                                            const savings = basePrice > uPrice ? (basePrice - uPrice) : 0;
                                            const savingsPct = basePrice > 0 && savings > 0 ? ((savings / basePrice) * 100).toFixed(1) : 0;

                                            return (
                                                <tr key={it.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontWeight: '700' }}>{idx + 1}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#0F172A', fontWeight: '800' }}>{name}</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#475569', fontWeight: '600' }}>{unit}</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#94A3B8', textDecoration: basePrice > uPrice ? 'line-through' : 'none', fontWeight: '600' }}>
                                                        {basePrice > 0 ? `$${formatPrice(basePrice)}` : '-'}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#0D7A57', fontWeight: '900', fontSize: '0.9rem' }}>
                                                        ${formatPrice(uPrice)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                        {savings > 0 ? (
                                                            <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: '800', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px' }}>
                                                                -${formatPrice(savings)} ({savingsPct}%)
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Tarifa Estándar</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Terms & Conditions Block */}
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            padding: '1.25rem',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            fontSize: '0.78rem',
                            color: '#64748B',
                            lineHeight: '1.5'
                        }}>
                            <div style={{ fontWeight: '800', color: '#0F172A', marginBottom: '4px', textTransform: 'uppercase' }}>
                                Condiciones Comerciales de Servicio
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                                <li>Los precios de este acuerdo se aplicarán automáticamente a cada orden generada dentro del Portal B2B FruFresco.</li>
                                <li>Los pedidos realizados antes de las 5:00 PM aplican para entrega garantizada al día siguiente.</li>
                                <li>La calidad y el gramaje de los insumos son validados mediante checklist de calidad digital en bodega antes del despacho.</li>
                            </ul>
                        </div>

                        {/* Signatures Footer for Formal Document */}
                        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '200px', textAlign: 'center' }}>
                                <div style={{ height: '40px', borderBottom: '1px dashed #94A3B8', marginBottom: '8px' }}></div>
                                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0F172A' }}>FruFresco B2B S.A.S</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Dirección de Operaciones & Cuentas Institucionales</div>
                            </div>

                            <div style={{ flex: 1, minWidth: '200px', textAlign: 'center' }}>
                                <div style={{ height: '40px', borderBottom: '1px dashed #94A3B8', marginBottom: '8px' }}></div>
                                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0F172A' }}>{clientProfile?.company_name || 'Cliente Institucional'}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Representación Autorizada de Compras</div>
                            </div>
                        </div>
                    </Letterhead>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #printable-agreement-modal, #printable-agreement-modal * {
                        visibility: visible;
                    }
                    #printable-agreement-modal {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        max-width: 100% !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        background: white !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
