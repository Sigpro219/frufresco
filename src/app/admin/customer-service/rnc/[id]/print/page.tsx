'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseRcaFromRecord, RESPONSIBLE_PARTIES, RCA_CATEGORIES_L1, getStoredTaxonomy } from '@/lib/rcaTaxonomy';
import { Printer, ArrowLeft, ShieldAlert, CheckCircle2, FileText, Building2, User, Phone, MapPin, Calendar, Camera } from 'lucide-react';

export default function RncPrintPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const [pqr, setPqr] = useState<any>(null);
    const [novelties, setNovelties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRncData = async () => {
            if (!id) return;
            try {
                // 1. Fetch PQR with profile and order data
                const { data: pqrData, error: pqrErr } = await supabase
                    .from('customer_service_pqrs')
                    .select(`
                        *,
                        profiles:client_id(id, company_name, contact_name, role, nit, email, phone, contact_phone),
                        orders:order_id(id, sequence_id, total, created_at, delivery_date, delivery_slot, shipping_address, origin_source, admin_notes)
                    `)
                    .eq('id', id)
                    .single();

                if (pqrErr) throw pqrErr;
                setPqr(pqrData);

                // Set dynamic document title for clean PDF export name
                const pqrShort = pqrData?.id?.substring(0, 6)?.toUpperCase() || '0000';
                const orderNum = pqrData?.orders?.sequence_id ? `#${pqrData.orders.sequence_id}` : 'S-P';
                document.title = `RNC-PQR-${pqrShort}_ORD-${orderNum}_FruFresco`;

                // 2. If order exists, fetch associated novelties/returns
                if (pqrData?.order_id) {
                    const { data: returnsData } = await supabase
                        .from('billing_returns')
                        .select(`
                            *,
                            products(name, sku, unit_of_measure)
                        `)
                        .eq('order_id', pqrData.order_id);
                    
                    setNovelties(returnsData || []);
                }
            } catch (err) {
                console.error('Error cargando datos del RNC:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchRncData();
    }, [id]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'sans-serif', color: '#475569' }}>
                <p>Generando Acta de No Conformidad (RNC)...</p>
            </div>
        );
    }

    if (!pqr) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
                <h2>No se encontró el caso especificado para generar el RNC.</h2>
                <button onClick={() => router.back()} style={{ marginTop: '1rem', padding: '8px 16px', cursor: 'pointer' }}>
                    Volver
                </button>
            </div>
        );
    }

    // Parse RCA information
    const rca = parseRcaFromRecord(pqr);
    const storedTaxonomy = getStoredTaxonomy();
    const catL1 = storedTaxonomy.find(c => c.code === rca.categoryL1) || RCA_CATEGORIES_L1.find(c => c.code === rca.categoryL1);
    const subtypeL2 = catL1?.subtypes.find(s => s.code === rca.subtypeL2);
    const party = RESPONSIBLE_PARTIES[rca.responsible] || RESPONSIBLE_PARTIES.transporte;

    // Photos
    const photos: string[] = [];
    if (pqr.primary_photo_url) photos.push(pqr.primary_photo_url);
    if (Array.isArray(pqr.additional_photos)) {
        pqr.additional_photos.forEach((url: string) => {
            if (url && !photos.includes(url)) photos.push(url);
        });
    }

    const consecutive = pqr.id.substring(0, 8).toUpperCase();
    const orderSequence = pqr.orders?.sequence_id ? `#${pqr.orders.sequence_id}` : 'Sin Pedido Vinculado';
    const clientName = pqr.profiles?.company_name || pqr.profiles?.contact_name || 'Cliente B2B';
    const clientNit = pqr.profiles?.nit || 'No Registrado';
    const clientPhone = pqr.profiles?.contact_phone || pqr.profiles?.phone || 'No Registrado';
    const address = pqr.orders?.shipping_address || 'Entrega en Sede Principal';
    const creationDate = new Date(pqr.created_at).toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="rnc-container">
            {/* CSS Print Styles following FruFresco Quality Auditor Standards */}
            <style dangerouslySetInnerHTML={{ __html: `
                @page {
                    size: letter portrait;
                    margin: 1.1cm 1.3cm 1.3cm 1.3cm;
                }
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body, html {
                        background: #FFFFFF !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                        font-size: 10pt !important;
                    }
                    .rnc-container {
                        padding: 0 !important;
                        max-width: 100% !important;
                        box-shadow: none !important;
                        border: none !important;
                    }
                    thead {
                        display: table-header-group;
                    }
                    tfoot {
                        display: table-row-group;
                    }
                    .page-break-avoid {
                        page-break-inside: avoid;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
                @media screen {
                    body {
                        background-color: #F1F5F9;
                        margin: 0;
                        padding: 2rem 1rem;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    }
                    .rnc-container {
                        max-width: 850px;
                        margin: 0 auto;
                        background: #FFFFFF;
                        padding: 2.5rem;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                    }
                }
            ` }} />

            {/* Action Toolbar (Screen Only) */}
            <div className="no-print" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid #E2E8F0'
            }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        color: '#334155',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                    }}
                >
                    <ArrowLeft size={16} /> Volver
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => window.print()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '9px 18px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '700',
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                        }}
                    >
                        <Printer size={16} /> Imprimir / Guardar como PDF
                    </button>
                </div>
            </div>

            {/* Subtle Fixed Watermark */}
            <div style={{
                position: 'fixed',
                top: '40%',
                left: '20%',
                transform: 'rotate(-35deg)',
                fontSize: '5rem',
                fontWeight: '900',
                color: 'rgba(15, 23, 42, 0.025)',
                pointerEvents: 'none',
                zIndex: 0,
                letterSpacing: '0.1em'
            }}>
                FRUFRESCO CALIDAD
            </div>

            {/* RNC Header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '2.5px solid #0D7A57',
                paddingBottom: '1rem',
                marginBottom: '1.25rem',
                position: 'relative'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '1.35rem',
                            fontWeight: '900',
                            color: '#0D7A57',
                            letterSpacing: '-0.03em'
                        }}>
                            FRUFRESCO
                        </span>
                        <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            backgroundColor: '#EAEFEA',
                            color: '#0D7A57',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            textTransform: 'uppercase'
                        }}>
                            Aseguramiento de Calidad
                        </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '3px' }}>
                        FruFresco S.A.S. • NIT: 901.765.432-1 • Sistema de Gestión de Inocuidad y Calidad
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        Bogotá D.C., Colombia • Operaciones y Distribución de Perecederos
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        display: 'inline-block',
                        backgroundColor: '#FEF2F2',
                        border: '1.5px solid #F87171',
                        color: '#991B1B',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: '900',
                        fontSize: '0.85rem',
                        letterSpacing: '0.04em'
                    }}>
                        RNC #{consecutive}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px', fontWeight: '600' }}>
                        Fecha Emisión: {creationDate}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#0D7A57', fontWeight: '700' }}>
                        Pedido Afectado: {orderSequence}
                    </div>
                </div>
            </header>

            {/* Document Title Banner */}
            <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        Reporte de Salida No Conforme (RNC) & Plan de Acción
                    </h1>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                        Conforme a la Cláusula 8.7 de ISO 9001:2015 y Buenas Prácticas de Manufactura (Res. 2674/2013 Invima).
                    </div>
                </div>
                <span style={{
                    padding: '3px 10px',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    backgroundColor: pqr.status === 'resolved' ? '#DCFCE7' : '#FEF3C7',
                    color: pqr.status === 'resolved' ? '#166534' : '#92400E',
                    border: `1px solid ${pqr.status === 'resolved' ? '#86EFAC' : '#FDE68A'}`
                }}>
                    {pqr.status === 'resolved' ? 'Caso Dictaminado & Resuelto' : 'En Investigación de Calidad'}
                </span>
            </div>

            {/* Section 1: Customer & Logistics Identification */}
            <section className="page-break-avoid" style={{ marginBottom: '1.25rem' }}>
                <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    color: '#0D7A57',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}>
                    <Building2 size={13} /> 1. Identificación del Cliente y Despacho Logístico
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                    backgroundColor: '#FAFAFA',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '0.78rem'
                }}>
                    <div>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase' }}>Razón Social / Cliente</div>
                        <div style={{ fontWeight: '800', color: '#1E293B' }}>{clientName}</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase' }}>NIT / Identificación</div>
                        <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientNit}</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase' }}>Contacto / Ecónomo</div>
                        <div style={{ fontWeight: '700', color: '#1E293B' }}>{pqr.profiles?.contact_name || 'No especificado'}</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase' }}>Teléfono / WhatsApp</div>
                        <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientPhone}</div>
                    </div>
                    <div style={{ gridColumn: 'span 3' }}>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase' }}>Dirección de Entrega</div>
                        <div style={{ fontWeight: '600', color: '#334155' }}>{address}</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase' }}>Canal de Origen</div>
                        <div style={{ fontWeight: '700', color: '#0D7A57' }}>{pqr.type?.toUpperCase()} • {pqr.category?.toUpperCase()}</div>
                    </div>
                </div>
            </section>

            {/* Section 2: Technical Root Cause Analysis (RCA) */}
            <section className="page-break-avoid" style={{ marginBottom: '1.25rem' }}>
                <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    color: '#0D7A57',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}>
                    <ShieldAlert size={13} /> 2. Dictamen Técnico & Clasificación Causa Raíz (RCA Lean)
                </div>

                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 2fr 1.5fr',
                        backgroundColor: '#F1F5F9',
                        padding: '8px 12px',
                        borderBottom: '1px solid #CBD5E1',
                        fontSize: '0.72rem',
                        fontWeight: '800',
                        color: '#475569',
                        textTransform: 'uppercase'
                    }}>
                        <div>Familia Defecto (L1)</div>
                        <div>Subtipo Específico (L2)</div>
                        <div>Imputabilidad de Costo</div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 2fr 1.5fr',
                        padding: '10px 12px',
                        fontSize: '0.8rem',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        borderBottom: '1px solid #F1F5F9'
                    }}>
                        <div style={{ fontWeight: '800', color: '#0F172A' }}>
                            {catL1?.label || rca.categoryL1}
                        </div>
                        <div style={{ color: '#334155' }}>
                            <div style={{ fontWeight: '700' }}>{subtypeL2?.label || rca.subtypeL2 || 'Defecto no estandarizado'}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{subtypeL2?.description || ''}</div>
                        </div>
                        <div>
                            <span style={{
                                display: 'inline-block',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                textTransform: 'uppercase',
                                backgroundColor: party.bgLight,
                                color: party.color,
                                border: `1px solid ${party.border}`
                            }}>
                                {party.label}
                            </span>
                        </div>
                    </div>

                    {/* Problem Statement & Client Observation */}
                    <div style={{ padding: '10px 12px', backgroundColor: '#FAFAFA', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: '800', color: '#334155', marginBottom: '3px' }}>
                            Asunto Reportado: <span style={{ fontWeight: '600', color: '#0F172A' }}>{pqr.subject}</span>
                        </div>
                        <div style={{ color: '#475569', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                            <span style={{ fontWeight: '700' }}>Descripción de la Falla:</span> {pqr.description}
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 3: Affected SKUs & Novelty Detail Table */}
            {novelties.length > 0 && (
                <section className="page-break-avoid" style={{ marginBottom: '1.25rem' }}>
                    <div style={{
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        color: '#0D7A57',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                    }}>
                        <FileText size={13} /> 3. Detalle de Ítems Afectados / Mercancía Rechazada
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                                <th style={{ padding: '6px 10px', color: '#475569', fontWeight: '800' }}>SKU</th>
                                <th style={{ padding: '6px 10px', color: '#475569', fontWeight: '800' }}>Producto</th>
                                <th style={{ padding: '6px 10px', color: '#475569', fontWeight: '800', textAlign: 'center' }}>Cant. Devuelta</th>
                                <th style={{ padding: '6px 10px', color: '#475569', fontWeight: '800' }}>Motivo Reportado en Descarga</th>
                                <th style={{ padding: '6px 10px', color: '#475569', fontWeight: '800', textAlign: 'right' }}>Estado Novedad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {novelties.map((item, idx) => (
                                <tr key={item.id || idx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                    <td style={{ padding: '6px 10px', fontWeight: '700', color: '#64748B' }}>{item.products?.sku || 'N/A'}</td>
                                    <td style={{ padding: '6px 10px', fontWeight: '800', color: '#1E293B' }}>{item.products?.name || 'Producto'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '900', color: '#DC2626' }}>
                                        {item.quantity_returned} {item.products?.unit_of_measure || 'un'}
                                    </td>
                                    <td style={{ padding: '6px 10px', color: '#334155' }}>{item.reason || 'Sin observación'}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', color: item.status === 'approved' ? '#166534' : '#92400E' }}>
                                        {item.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {/* Section 4: Photographic Evidence Grid */}
            {photos.length > 0 && (
                <section className="page-break-avoid" style={{ marginBottom: '1.25rem' }}>
                    <div style={{
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        color: '#0D7A57',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                    }}>
                        <Camera size={13} /> 4. Registro Fotográfico de Evidencia en Sitio / Descarga
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: photos.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                        gap: '10px'
                    }}>
                        {photos.slice(0, 4).map((url, i) => (
                            <div key={i} style={{
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                padding: '6px',
                                backgroundColor: '#F8FAFC',
                                textAlign: 'center'
                            }}>
                                <img
                                    src={url}
                                    alt={`Evidencia ${i + 1}`}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '160px',
                                        objectFit: 'contain',
                                        borderRadius: '4px',
                                        display: 'block',
                                        margin: '0 auto'
                                    }}
                                />
                                <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px', fontWeight: '600' }}>
                                    Foto #{i + 1} • Registro Probatorio Inalterable
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Section 5: Technical Resolution & Sanitary Disposal Protocol */}
            <section className="page-break-avoid" style={{ marginBottom: '1.5rem' }}>
                <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    color: '#0D7A57',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}>
                    <CheckCircle2 size={13} /> 5. Dictamen de Disposición y Protocolo de Resolución
                </div>

                <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '0.78rem'
                }}>
                    <div style={{ color: '#0F172A', whiteSpace: 'pre-line', lineHeight: '1.45', fontWeight: '500' }}>
                        {pqr.resolution_notes || 'Caso pendiente de dictamen definitivo en mesa técnica de calidad.'}
                    </div>

                    {pqr.resolved_at && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #CBD5E1', fontSize: '0.7rem', color: '#64748B' }}>
                            Dictaminado el: <span style={{ fontWeight: '700' }}>{new Date(pqr.resolved_at).toLocaleString('es-CO')}</span>
                        </div>
                    )}
                </div>
            </section>

            {/* Section 6: Official Three-Party Signatures */}
            <section className="page-break-avoid" style={{ marginTop: '2rem' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '20px',
                    textAlign: 'center'
                }}>
                    {/* Inspector FruFresco */}
                    <div>
                        <div style={{ height: '45px', borderBottom: '1px solid #334155', marginBottom: '6px' }}></div>
                        <div style={{ fontWeight: '800', fontSize: '0.76rem', color: '#0F172A' }}>
                            Aseguramiento de Calidad
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            FruFresco Operaciones S.A.S.
                        </div>
                    </div>

                    {/* Transportador */}
                    <div>
                        <div style={{ height: '45px', borderBottom: '1px solid #334155', marginBottom: '6px' }}></div>
                        <div style={{ fontWeight: '800', fontSize: '0.76rem', color: '#0F172A' }}>
                            Transportador / Distribución
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            C.C. / Placa del Vehículo
                        </div>
                    </div>

                    {/* Cliente */}
                    <div>
                        <div style={{ height: '45px', borderBottom: '1px solid #334155', marginBottom: '6px' }}></div>
                        <div style={{ fontWeight: '800', fontSize: '0.76rem', color: '#0F172A' }}>
                            Recibido Conforme Cliente
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            {clientName} • Sello / Firma
                        </div>
                    </div>
                </div>

                {/* Footer Note */}
                <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#94A3B8', marginTop: '25px' }}>
                    Documento interno de control de calidad y trazabilidad. Válido para deducción contable, reclamación a transportador o nota débito a proveedor.
                </div>
            </section>
        </div>
    );
}
