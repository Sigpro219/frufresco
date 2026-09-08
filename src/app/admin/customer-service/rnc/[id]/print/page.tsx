'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseRcaFromRecord, RESPONSIBLE_PARTIES, RCA_CATEGORIES_L1, getStoredTaxonomy } from '@/lib/rcaTaxonomy';
import { Printer, ArrowLeft, ShieldAlert, CheckCircle2, FileText, Building2, User, Phone, MapPin, Calendar, Camera, ShieldCheck } from 'lucide-react';

export default function RncPrintPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const [pqr, setPqr] = useState<any>(null);
    const [novelties, setNovelties] = useState<any[]>([]);
    const [appSettings, setAppSettings] = useState<{ [key: string]: string }>({});
    const [loading, setLoading] = useState(true);
    const [logoLoaded, setLogoLoaded] = useState(false);

    useEffect(() => {
        const fetchRncData = async () => {
            if (!id) return;
            try {
                // 1. Fetch App Settings for official corporate identity of Investments Cortés S.A.S.
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('key, value');
                
                const settingsMap: { [key: string]: string } = {};
                if (settingsData) {
                    settingsData.forEach((row: any) => {
                        settingsMap[row.key] = row.value;
                    });
                }
                setAppSettings(settingsMap);

                // 2. Fetch PQR with profile and order data
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
                const pqrShort = pqrData?.id?.substring(0, 8)?.toUpperCase() || '0000';
                const orderNum = pqrData?.orders?.sequence_id ? `#${pqrData.orders.sequence_id}` : 'SP';
                document.title = `RNC-${pqrShort}_ORD-${orderNum}_INVESTMENTS_CORTES`;

                // 3. Fetch associated novelties/returns if order exists
                if (pqrData?.order_id) {
                    const { data: returnsData } = await supabase
                        .from('billing_returns')
                        .select(`
                            *,
                            products(name, sku, unit_of_measure, base_price)
                        `)
                        .eq('order_id', pqrData.order_id);
                    
                    setNovelties(returnsData || []);
                }

                // 4. Preload official logo
                const logoUrl = settingsMap.provider_logo_url || '/logo-investments.png';
                const img = new Image();
                img.onload = () => setLogoLoaded(true);
                img.onerror = () => setLogoLoaded(true);
                img.src = logoUrl;
            } catch (err) {
                console.error('Error cargando datos oficiales del RNC:', err);
                setLogoLoaded(true);
            } finally {
                setLoading(false);
            }
        };

        fetchRncData();
    }, [id]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'system-ui, sans-serif', color: '#475569' }}>
                <p style={{ fontWeight: '700', fontSize: '0.95rem' }}>Generando Reporte Oficial de No Conformidad (RNC) • Investments Cortés S.A.S....</p>
            </div>
        );
    }

    if (!pqr) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
                <h2 style={{ color: '#0F172A' }}>No se encontró el caso especificado para generar el RNC.</h2>
                <button onClick={() => router.back()} style={{ marginTop: '1rem', padding: '8px 16px', cursor: 'pointer', borderRadius: '8px', backgroundColor: '#0D7A57', color: 'white', border: 'none', fontWeight: '700' }}>
                    Volver a Gestión de Calidad
                </button>
            </div>
        );
    }

    // Corporate info from database or official defaults
    const companyLegalName = appSettings.provider_legal_name || 'Investments Cortés S.A.S.';
    const companyNit = appSettings.provider_nit ? (appSettings.provider_nit.includes('-') ? appSettings.provider_nit : `${appSettings.provider_nit}-5`) : '901.393.217-5';
    const companyAddress = appSettings.provider_address || 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C.';
    const companyEmail = appSettings.provider_email || 'contacto@investmentscortes.com';
    const companyPhone = appSettings.provider_phone || '315 406 3876';
    const companyLogo = appSettings.provider_logo_url || '/logo-investments.png';

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
    const clientName = pqr.profiles?.company_name || pqr.profiles?.contact_name || 'Cliente Institucional B2B';
    const clientNit = pqr.profiles?.nit || 'No Registrado';
    const clientContact = pqr.profiles?.contact_name || pqr.profiles?.company_name || 'No especificado';
    const clientPhone = pqr.profiles?.contact_phone || pqr.profiles?.phone || 'No Registrado';
    const address = pqr.orders?.shipping_address || 'Entrega en Sede Principal';
    
    const creationDateFull = new Date(pqr.created_at).toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const creationDateOnly = new Date(pqr.created_at).toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const resolutionDate = pqr.resolved_at 
        ? new Date(pqr.resolved_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'En investigación técnica';

    // Total economic impact (Cost of Quality)
    const totalImpactCoQ = novelties.reduce((sum, item) => {
        const price = item.products?.base_price || 0;
        return sum + (price * (Number(item.quantity_returned) || 0));
    }, 0);

    return (
        <div className="rnc-container">
            {/* CSS Print Styles following Auditor de Calidad & FruFresco Official Standards */}
            <style dangerouslySetInnerHTML={{ __html: `
                * { box-sizing: border-box; }
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
                        color: #0F172A !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                        font-size: 8pt !important;
                        line-height: 1.25 !important;
                    }
                    .rnc-container {
                        padding: 0 !important;
                        max-width: 100% !important;
                        box-shadow: none !important;
                        border: none !important;
                        margin: 0 !important;
                        width: 100% !important;
                    }
                    thead {
                        display: table-header-group;
                    }
                    tfoot {
                        display: table-row-group;
                    }
                    .page-break-avoid {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
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
                        padding: 2.2rem 2.5rem;
                        border-radius: 12px;
                        box-shadow: 0 4px 25px rgba(0,0,0,0.08);
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
                        fontWeight: '700',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <ArrowLeft size={15} /> Volver a Gestión de Calidad
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
                        Formato Oficial Investments Cortés S.A.S. • Protocolo PDF
                    </span>
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
                            fontWeight: '800',
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Printer size={16} /> Imprimir / Guardar como PDF
                    </button>
                </div>
            </div>

            {/* Fixed Watermark (Subtle Corporate Watermark) */}
            <div style={{
                position: 'fixed',
                top: '45%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-30deg)',
                width: '380px',
                height: '380px',
                backgroundImage: `url(${companyLogo})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'contain',
                opacity: 0.025,
                pointerEvents: 'none',
                zIndex: 0
            }} />

            {/* 1. OFFICIAL INVESTMENTS CORTÉS DOCUMENT CONTROL HEADER TABLE (SGC ISO 9001 STANDARD) */}
            <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '1.5px solid #1E293B',
                marginBottom: '12px',
                backgroundColor: '#FFFFFF',
                position: 'relative',
                zIndex: 1
            }}>
                <tbody>
                    <tr>
                        {/* Cell 1: Official Logo & Legal Entity */}
                        <td rowSpan={4} style={{
                            width: '28%',
                            textAlign: 'center',
                            padding: '8px 10px',
                            border: '1px solid #334155',
                            verticalAlign: 'middle',
                            backgroundColor: '#FFFFFF'
                        }}>
                            <img
                                src={companyLogo}
                                alt="Investments Cortés"
                                style={{
                                    maxHeight: '52px',
                                    maxWidth: '100%',
                                    objectFit: 'contain',
                                    margin: '0 auto 4px auto',
                                    display: 'block'
                                }}
                            />
                            <div style={{ fontSize: '8pt', fontWeight: '900', color: '#0F172A', lineHeight: '1.15', textTransform: 'uppercase' }}>
                                {companyLegalName}
                            </div>
                            <div style={{ fontSize: '6.8pt', color: '#475569', fontWeight: '700', marginTop: '2px' }}>
                                NIT: {companyNit} • FruFresco Operaciones
                            </div>
                            <div style={{ fontSize: '6.4pt', color: '#64748B', lineHeight: '1.2' }}>
                                {companyAddress}
                            </div>
                        </td>

                        {/* Cell 2: Document Formal Title & SGC Subtitle */}
                        <td rowSpan={4} style={{
                            textAlign: 'center',
                            border: '1px solid #334155',
                            verticalAlign: 'middle',
                            padding: '8px 12px',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div style={{ fontSize: '7.2pt', fontWeight: '800', color: '#0D7A57', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>
                                SISTEMA DE GESTIÓN DE CALIDAD E INOCUIDAD (SGC)
                            </div>
                            <div style={{ fontSize: '11pt', fontWeight: '900', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.2' }}>
                                REPORTE DE SALIDA NO CONFORME (RNC)
                            </div>
                            <div style={{ fontSize: '6.8pt', color: '#64748B', marginTop: '3px', fontWeight: '600' }}>
                                Control de Calidad Agroindustrial • ISO 9001:2015 (8.7) • BPM Res. 2674/2013 Invima
                            </div>
                        </td>

                        {/* Cell 3: Document Control Metadata (4 rows) */}
                        <td style={{ width: '22%', fontSize: '7.2pt', fontWeight: '800', color: '#334155', padding: '3.5px 8px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                            <span style={{ color: '#64748B', fontWeight: '600' }}>CÓDIGO:</span> SGC-RNC-001
                        </td>
                    </tr>
                    <tr>
                        <td style={{ fontSize: '7.2pt', fontWeight: '800', color: '#334155', padding: '3.5px 8px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                            <span style={{ color: '#64748B', fontWeight: '600' }}>VERSIÓN:</span> 002
                        </td>
                    </tr>
                    <tr>
                        <td style={{ fontSize: '7.2pt', fontWeight: '800', color: '#0D7A57', padding: '3.5px 8px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                            <span style={{ color: '#64748B', fontWeight: '600' }}>RADICADO:</span> RNC #{consecutive}
                        </td>
                    </tr>
                    <tr>
                        <td style={{ fontSize: '7.2pt', fontWeight: '800', color: '#334155', padding: '3.5px 8px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                            <span style={{ color: '#64748B', fontWeight: '600' }}>EMISIÓN:</span> {creationDateOnly}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* 2. CASE STATUS & LOGISTICS TRACEABILITY BANNER */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderLeft: '4px solid #0D7A57',
                borderRadius: '6px',
                padding: '6px 12px',
                marginBottom: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ShieldCheck size={14} color="#0D7A57" />
                        <span style={{ fontSize: '7.6pt', fontWeight: '900', color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            Estado de Calidad:
                        </span>
                    </div>
                    <span style={{
                        fontSize: '6.8pt',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: pqr.status === 'resolved' ? '#DCFCE7' : '#FEF3C7',
                        color: pqr.status === 'resolved' ? '#15803D' : '#B45309',
                        border: `1px solid ${pqr.status === 'resolved' ? '#86EFAC' : '#FDE68A'}`,
                        textTransform: 'uppercase'
                    }}>
                        {pqr.status === 'resolved' ? 'Dictaminado & Resuelto' : 'En Investigación Técnica'}
                    </span>
                </div>
                <div style={{ fontSize: '7.5pt', color: '#334155', fontWeight: '700' }}>
                    Pedido FruFresco Vinculado: <strong style={{ color: '#0D7A57' }}>{orderSequence}</strong>
                </div>
            </div>

            {/* SECTION 1: CUSTOMER & LOGISTICS IDENTIFICATION */}
            <section className="page-break-avoid" style={{ marginBottom: '12px' }}>
                <div style={{
                    backgroundColor: '#EAEFEA',
                    border: '1px solid #BBF7D0',
                    borderLeft: '4px solid #0D7A57',
                    color: '#0D7A57',
                    fontWeight: '900',
                    fontSize: '7.8pt',
                    padding: '4px 8px',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    letterSpacing: '0.04em'
                }}>
                    <Building2 size={13} />
                    <span>1. Identificación del Cliente Institucional y Despacho Logístico</span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E2E8F0', fontSize: '7.6pt', backgroundColor: '#FAFAFA' }}>
                    <tbody>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ width: '25%', padding: '5px 8px', borderRight: '1px solid #E2E8F0' }}>
                                <div style={{ color: '#64748B', fontSize: '6.6pt', fontWeight: '800', textTransform: 'uppercase' }}>Razón Social / Cliente</div>
                                <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '8.2pt' }}>{clientName}</div>
                            </td>
                            <td style={{ width: '25%', padding: '5px 8px', borderRight: '1px solid #E2E8F0' }}>
                                <div style={{ color: '#64748B', fontSize: '6.6pt', fontWeight: '800', textTransform: 'uppercase' }}>NIT / Documento</div>
                                <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientNit}</div>
                            </td>
                            <td style={{ width: '25%', padding: '5px 8px', borderRight: '1px solid #E2E8F0' }}>
                                <div style={{ color: '#64748B', fontSize: '6.6pt', fontWeight: '800', textTransform: 'uppercase' }}>Contacto / Ecónomo</div>
                                <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientContact}</div>
                            </td>
                            <td style={{ width: '25%', padding: '5px 8px' }}>
                                <div style={{ color: '#64748B', fontSize: '6.6pt', fontWeight: '800', textTransform: 'uppercase' }}>Teléfono / Celular</div>
                                <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientPhone}</div>
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={3} style={{ padding: '5px 8px', borderRight: '1px solid #E2E8F0' }}>
                                <div style={{ color: '#64748B', fontSize: '6.6pt', fontWeight: '800', textTransform: 'uppercase' }}>Dirección de Entrega / Sede</div>
                                <div style={{ fontWeight: '600', color: '#334155' }}>{address}</div>
                            </td>
                            <td style={{ padding: '5px 8px' }}>
                                <div style={{ color: '#64748B', fontSize: '6.6pt', fontWeight: '800', textTransform: 'uppercase' }}>Fecha de Despacho / Radicación</div>
                                <div style={{ fontWeight: '700', color: '#0D7A57' }}>{creationDateFull}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>

            {/* SECTION 2: TECHNICAL ROOT CAUSE ANALYSIS (RCA LEAN) */}
            <section className="page-break-avoid" style={{ marginBottom: '12px' }}>
                <div style={{
                    backgroundColor: '#EAEFEA',
                    border: '1px solid #BBF7D0',
                    borderLeft: '4px solid #0D7A57',
                    color: '#0D7A57',
                    fontWeight: '900',
                    fontSize: '7.8pt',
                    padding: '4px 8px',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    letterSpacing: '0.04em'
                }}>
                    <ShieldAlert size={13} />
                    <span>2. Dictamen Técnico y Causa Raíz (Metodología RCA Lean Six Sigma)</span>
                </div>

                <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 2fr 1.3fr',
                        backgroundColor: '#F1F5F9',
                        padding: '6px 10px',
                        borderBottom: '1px solid #CBD5E1',
                        fontSize: '6.8pt',
                        fontWeight: '800',
                        color: '#475569',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                    }}>
                        <div>Familia Causa Raíz (Nivel 1)</div>
                        <div>Subtipo de Falla (Nivel 2)</div>
                        <div>Imputabilidad Económica</div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 2fr 1.3fr',
                        padding: '8px 10px',
                        fontSize: '7.6pt',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        borderBottom: '1px solid #F1F5F9'
                    }}>
                        <div style={{ fontWeight: '800', color: '#0F172A' }}>
                            {catL1?.label || rca.categoryL1}
                        </div>
                        <div style={{ color: '#334155' }}>
                            <div style={{ fontWeight: '700' }}>{subtypeL2?.label || rca.subtypeL2 || 'Defecto técnico no codificado'}</div>
                            <div style={{ fontSize: '6.8pt', color: '#64748B' }}>{subtypeL2?.description || ''}</div>
                        </div>
                        <div>
                            <span style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '5px',
                                fontSize: '6.8pt',
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
                    <div style={{ padding: '8px 10px', backgroundColor: '#FAFAFA', fontSize: '7.5pt', borderTop: '1px solid #E2E8F0' }}>
                        <div style={{ fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '6.6pt' }}>ASUNTO RADICADO: </span>
                            {pqr.subject}
                        </div>
                        <div style={{ color: '#334155', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '6.6pt' }}>HALLAZGO / OBSERVACIÓN: </span>
                            {pqr.description}
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 3: REJECTED SKUS & ECONOMIC IMPACT (COST OF QUALITY) */}
            {novelties.length > 0 && (
                <section className="page-break-avoid" style={{ marginBottom: '12px' }}>
                    <div style={{
                        backgroundColor: '#EAEFEA',
                        border: '1px solid #BBF7D0',
                        borderLeft: '4px solid #0D7A57',
                        color: '#0D7A57',
                        fontWeight: '900',
                        fontSize: '7.8pt',
                        padding: '4px 8px',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        letterSpacing: '0.04em'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileText size={13} />
                            <span>3. Relación de Producto No Conforme y Valorización Económica (CoQ)</span>
                        </div>
                        {totalImpactCoQ > 0 && (
                            <span style={{ fontSize: '7.2pt', fontWeight: '800', color: '#DC2626' }}>
                                Costo Total No Calidad: ${totalImpactCoQ.toLocaleString('es-CO')} COP
                            </span>
                        )}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.4pt', border: '1px solid #CBD5E1' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                                <th style={{ padding: '5px 8px', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '6.6pt', width: '12%' }}>SKU</th>
                                <th style={{ padding: '5px 8px', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '6.6pt', width: '38%' }}>Descripción de Ítem</th>
                                <th style={{ padding: '5px 8px', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '6.6pt', textAlign: 'center', width: '15%' }}>Cant. Rechazada</th>
                                <th style={{ padding: '5px 8px', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '6.6pt', width: '23%' }}>Causal en Descarga</th>
                                <th style={{ padding: '5px 8px', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '6.6pt', textAlign: 'right', width: '12%' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {novelties.map((item, idx) => (
                                <tr key={item.id || idx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                    <td style={{ padding: '5px 8px', fontWeight: '700', color: '#64748B' }}>{item.products?.sku || 'N/A'}</td>
                                    <td style={{ padding: '5px 8px', fontWeight: '800', color: '#0F172A' }}>{item.products?.name || 'Producto'}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: '900', color: '#DC2626' }}>
                                        {item.quantity_returned} {item.products?.unit_of_measure || 'un'}
                                    </td>
                                    <td style={{ padding: '5px 8px', color: '#334155' }}>{item.reason || 'Sin observación'}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: '800', color: item.status === 'approved' ? '#15803D' : '#B45309' }}>
                                        {item.status === 'approved' ? 'Aprobada' : 'En Revisión'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {totalImpactCoQ > 0 && (
                            <tfoot>
                                <tr style={{ backgroundColor: '#F8FAFC', borderTop: '1.5px solid #CBD5E1' }}>
                                    <td colSpan={2} style={{ padding: '5px 8px', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', fontSize: '7pt' }}>
                                        Impacto Contable Consolidado
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: '900', color: '#0F172A' }}>
                                        {novelties.reduce((acc, it) => acc + (Number(it.quantity_returned) || 0), 0)} Unidades
                                    </td>
                                    <td colSpan={2} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: '900', color: '#DC2626', fontSize: '8pt' }}>
                                        Total CoQ: ${totalImpactCoQ.toLocaleString('es-CO')} COP
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </section>
            )}

            {/* SECTION 4: PHOTOGRAPHIC EVIDENCE IN ACCORDANCE WITH AUDITOR DE CALIDAD */}
            {photos.length > 0 && (
                <section className="page-break-avoid" style={{ marginBottom: '12px' }}>
                    <div style={{
                        backgroundColor: '#EAEFEA',
                        border: '1px solid #BBF7D0',
                        borderLeft: '4px solid #0D7A57',
                        color: '#0D7A57',
                        fontWeight: '900',
                        fontSize: '7.8pt',
                        padding: '4px 8px',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        letterSpacing: '0.04em'
                    }}>
                        <Camera size={13} />
                        <span>4. Evidencia Fotográfica y Registro en Punto de Descarga</span>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: photos.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                        gap: '8px'
                    }}>
                        {photos.slice(0, 4).map((url, i) => (
                            <div key={i} style={{
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                padding: '5px',
                                backgroundColor: '#FAFAFA',
                                textAlign: 'center'
                            }}>
                                <img
                                    src={url}
                                    alt={`Evidencia Probatoria ${i + 1}`}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '145px',
                                        objectFit: 'contain',
                                        borderRadius: '4px',
                                        display: 'block',
                                        margin: '0 auto'
                                    }}
                                />
                                <div style={{ fontSize: '6.6pt', color: '#64748B', marginTop: '3px', fontWeight: '700' }}>
                                    Registro Fotográfico #{i + 1} • Inalterabilidad Probatoria SGC
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* SECTION 5: TECHNICAL RESOLUTION & SANITARY DISPOSAL PROTOCOL */}
            <section className="page-break-avoid" style={{ marginBottom: '14px' }}>
                <div style={{
                    backgroundColor: '#EAEFEA',
                    border: '1px solid #BBF7D0',
                    borderLeft: '4px solid #0D7A57',
                    color: '#0D7A57',
                    fontWeight: '900',
                    fontSize: '7.8pt',
                    padding: '4px 8px',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    letterSpacing: '0.04em'
                }}>
                    <CheckCircle2 size={13} />
                    <span>5. Dictamen Técnico, Plan de Acción (CAPA) y Disposición Sanitaria</span>
                </div>

                <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '7.6pt'
                }}>
                    <div style={{ color: '#0F172A', whiteSpace: 'pre-line', lineHeight: '1.45', fontWeight: '500' }}>
                        {pqr.resolution_notes || 'Caso en proceso de análisis e investigación técnica en mesa de calidad.'}
                    </div>

                    <div style={{
                        marginTop: '8px',
                        paddingTop: '6px',
                        borderTop: '1px dashed #CBD5E1',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '6.8pt',
                        color: '#64748B',
                        fontWeight: '600'
                    }}>
                        <span>Dictaminado en Sistema SGC: <strong>{resolutionDate}</strong></span>
                        <span>Protocolo Sanitario: <strong>Res. 2674/2013 Invima</strong></span>
                    </div>
                </div>
            </section>

            {/* SECTION 6: THREE-PARTY FORMAL LEGAL SIGNATURES */}
            <section className="page-break-avoid" style={{ marginTop: '16px' }}>
                <div style={{
                    backgroundColor: '#EAEFEA',
                    border: '1px solid #BBF7D0',
                    borderLeft: '4px solid #0D7A57',
                    color: '#0D7A57',
                    fontWeight: '900',
                    fontSize: '7.8pt',
                    padding: '4px 8px',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    letterSpacing: '0.04em'
                }}>
                    <ShieldCheck size={13} />
                    <span>6. Legalización y Cierre Formal de las Partes</span>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '16px',
                    textAlign: 'center'
                }}>
                    {/* Quality Inspector Investments Cortés */}
                    <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', backgroundColor: '#FAFAFA' }}>
                        <div style={{ height: '42px', borderBottom: '1px solid #475569', marginBottom: '6px' }}></div>
                        <div style={{ fontWeight: '900', fontSize: '7.4pt', color: '#0F172A' }}>
                            Aseguramiento de Calidad
                        </div>
                        <div style={{ fontSize: '6.6pt', color: '#0D7A57', fontWeight: '700' }}>
                            {companyLegalName}
                        </div>
                        <div style={{ fontSize: '6.2pt', color: '#64748B' }}>
                            FruFresco SGC • Control Agroindustrial
                        </div>
                    </div>

                    {/* Logistics / Driver */}
                    <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', backgroundColor: '#FAFAFA' }}>
                        <div style={{ height: '42px', borderBottom: '1px solid #475569', marginBottom: '6px' }}></div>
                        <div style={{ fontWeight: '900', fontSize: '7.4pt', color: '#0F172A' }}>
                            Transportador / Distribución
                        </div>
                        <div style={{ fontSize: '6.6pt', color: '#475569', fontWeight: '700' }}>
                            Operador Logístico de Flota
                        </div>
                        <div style={{ fontSize: '6.2pt', color: '#64748B' }}>
                            C.C. y Placa de Vehículo
                        </div>
                    </div>

                    {/* Client Representative */}
                    <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', backgroundColor: '#FAFAFA' }}>
                        <div style={{ height: '42px', borderBottom: '1px solid #475569', marginBottom: '6px' }}></div>
                        <div style={{ fontWeight: '900', fontSize: '7.4pt', color: '#0F172A' }}>
                            Recibido Conforme Cliente
                        </div>
                        <div style={{ fontSize: '6.6pt', color: '#475569', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {clientName}
                        </div>
                        <div style={{ fontSize: '6.2pt', color: '#64748B' }}>
                            Firma / Sello / C.C.
                        </div>
                    </div>
                </div>

                {/* Corporate Footer Legal Disclaimer */}
                <div style={{
                    textAlign: 'center',
                    fontSize: '6.4pt',
                    color: '#64748B',
                    marginTop: '16px',
                    paddingTop: '8px',
                    borderTop: '1px solid #E2E8F0',
                    lineHeight: '1.4'
                }}>
                    <div>
                        <strong>{companyLegalName}</strong> • NIT {companyNit} • {companyAddress} • {companyPhone} • {companyEmail}
                    </div>
                    <div style={{ color: '#94A3B8' }}>
                        Documento interno oficial del Sistema de Gestión de Calidad (SGC). Válido como sustento técnico para emisión de Notas Crédito, reposición logística de inventario y auditorías de certificación ISO 9001 / BPM.
                    </div>
                </div>
            </section>
        </div>
    );
}
