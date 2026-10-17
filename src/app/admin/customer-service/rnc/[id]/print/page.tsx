'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
    parseRcaFromRecord, 
    RESPONSIBLE_PARTIES, 
    RCA_CATEGORIES_L1, 
    getStoredTaxonomy,
    cleanHumanResolutionNotes,
    parseSanitaryAndHumanNotes
} from '@/lib/rcaTaxonomy';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { 
    Printer, ArrowLeft, ShieldAlert, CheckCircle2, FileText, 
    Building2, Camera, ShieldCheck, Users 
} from 'lucide-react';

export default function RncPrintPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const [pqr, setPqr] = useState<any>(null);
    const [novelties, setNovelties] = useState<any[]>([]);
    const [appSettings, setAppSettings] = useState<{ [key: string]: string }>({});
    const [loading, setLoading] = useState(true);

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
                            products(name, sku, unit_of_measure),
                            orders(order_items(product_id, unit_price))
                        `)
                        .eq('order_id', pqrData.order_id);
                    
                    setNovelties(returnsData || []);
                }
            } catch (err) {
                console.error('Error cargando datos oficiales del RNC:', err);
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

    // Corporate brand configuration using Investments Cortés preset
    const companyLegalName = appSettings.provider_legal_name || INVESTMENTS_CORTES_BRAND.companyName;
    const companyNit = appSettings.provider_nit 
        ? (appSettings.provider_nit.includes('NIT') ? appSettings.provider_nit : `NIT ${appSettings.provider_nit}`)
        : INVESTMENTS_CORTES_BRAND.legalId;
    const companyLogo = appSettings.provider_logo_url || INVESTMENTS_CORTES_BRAND.logoUrl;
    const companyAddress = appSettings.provider_address || INVESTMENTS_CORTES_BRAND.headquarters?.address || 'Carrera 35 # 8-45, Bogotá D.C.';
    const companyPhone = appSettings.provider_phone || INVESTMENTS_CORTES_BRAND.headquarters?.mobile || '+57 322 734 7971';
    const companyEmail = appSettings.provider_email || INVESTMENTS_CORTES_BRAND.headquarters?.email || 'calidad@frufresco.com';

    // Parse RCA information and nominal imputation
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
    const orderSequence = pqr.orders?.sequence_id ? `#${pqr.orders.sequence_id}` : 'Sin Pedido';
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
        const oi = item.orders?.order_items?.find((o: any) => o.product_id === item.product_id);
        const price = Number(oi?.unit_price || item.unit_price || 0);
        return sum + (price * (Number(item.quantity_returned) || 0));
    }, 0);

    const isResolved = pqr.status === 'resolved';
    const parsedResolution = parseSanitaryAndHumanNotes(pqr.resolution_notes || '', rca.notes);

    return (
        <div className="rnc-outer-wrapper">
            {/* Strict CSS for Carta (Letter) Paper & SGC Golden Print Standards */}
            <style dangerouslySetInnerHTML={{ __html: `
                @page {
                    size: letter portrait;
                    margin: 8mm 10mm 8mm 10mm;
                }
                * {
                    box-sizing: border-box;
                }
                @media print {
                    *, *::before, *::after {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        background: #FFFFFF !important;
                        color: #0F172A !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                        font-size: 7pt !important;
                        line-height: 1.25 !important;
                        width: 100% !important;
                        height: auto !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .rnc-outer-wrapper {
                        background: transparent !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        min-height: 0 !important;
                        width: 100% !important;
                    }
                    .rnc-paper {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        background: #FFFFFF !important;
                    }
                    .page-break-avoid {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .page-break-before {
                        page-break-before: always !important;
                        break-before: page !important;
                    }
                }
                @media screen {
                    .rnc-outer-wrapper {
                        background-color: #F1F5F9;
                        min-height: 100vh;
                        padding: 1.5rem 1rem;
                    }
                    .rnc-paper {
                        width: 215.9mm;
                        min-height: 279.4mm;
                        margin: 0 auto;
                        background-color: #FFFFFF;
                        padding: 8mm 10mm;
                        border-radius: 8px;
                        box-shadow: 0 4px 25px rgba(0,0,0,0.08);
                        border: 1px solid #CBD5E1;
                        box-sizing: border-box;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                    }
                }
            ` }} />

            {/* Screen Action Toolbar (Excluded from Print) */}
            <div className="no-print" style={{
                maxWidth: '215.9mm',
                margin: '0 auto 1rem auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                padding: '0.65rem 1.2rem',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
            }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        color: '#334155',
                        fontWeight: '700',
                        fontSize: '0.80rem',
                        cursor: 'pointer'
                    }}
                >
                    <ArrowLeft size={14} /> Volver a Gestión de Calidad
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>
                        Tamaño Carta (Letter 8.5" × 11") • Formato SGC ISO 9001
                    </span>
                    <button
                        onClick={() => window.print()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '7px 16px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: '800',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                        }}
                    >
                        <Printer size={15} /> Imprimir / Guardar como PDF
                    </button>
                </div>
            </div>

            {/* Formal Carta (Letter) Paper Canvas */}
            <div className="rnc-paper">
                {/* 1. OFFICIAL INVESTMENTS CORTÉS DOCUMENT CONTROL HEADER TABLE (SGC ISO 9001 STANDARD) */}
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '1.5px solid #1E293B',
                    marginBottom: '6px',
                    backgroundColor: '#FFFFFF'
                }}>
                    <tbody>
                        <tr>
                            {/* Cell 1: Official Logo & Legal Entity */}
                            <td rowSpan={4} style={{
                                width: '27%',
                                textAlign: 'center',
                                padding: '5px 8px',
                                border: '1px solid #334155',
                                verticalAlign: 'middle',
                                backgroundColor: '#FFFFFF'
                            }}>
                                <img
                                    src={companyLogo}
                                    alt="Investments Cortés S.A.S."
                                    style={{
                                        maxHeight: '38px',
                                        maxWidth: '100%',
                                        objectFit: 'contain',
                                        margin: '0 auto 3px auto',
                                        display: 'block'
                                    }}
                                />
                                <div style={{ fontSize: '7.6pt', fontWeight: '900', color: '#0F172A', lineHeight: '1.15', textTransform: 'uppercase' }}>
                                    {companyLegalName}
                                </div>
                                <div style={{ fontSize: '6.4pt', color: '#334155', fontWeight: '700', marginTop: '1px' }}>
                                    {companyNit} • FruFresco Operaciones
                                </div>
                                <div style={{ fontSize: '5.8pt', color: '#64748B', lineHeight: '1.15' }}>
                                    {companyAddress}
                                </div>
                            </td>

                            {/* Cell 2: Document Formal Title & SGC Subtitle */}
                            <td rowSpan={4} style={{
                                width: '48%',
                                textAlign: 'center',
                                border: '1px solid #334155',
                                verticalAlign: 'middle',
                                padding: '5px 8px',
                                backgroundColor: '#F8FAFC'
                            }}>
                                <div style={{ fontSize: '6.8pt', fontWeight: '800', color: '#0D7A57', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '1px' }}>
                                    SISTEMA DE GESTIÓN DE CALIDAD E INOCUIDAD (SGC)
                                </div>
                                <div style={{ fontSize: '10pt', fontWeight: '900', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.15' }}>
                                    REPORTE DE SALIDA NO CONFORME (RNC)
                                </div>
                                <div style={{ fontSize: '6pt', color: '#475569', marginTop: '2px', fontWeight: '600' }}>
                                    Control de Calidad Agroindustrial • ISO 9001:2015 (8.7) • BPM Res. 2674/2013 Invima
                                </div>
                            </td>

                            {/* Cell 3: Document Control Metadata (4 rows) */}
                            <td style={{ width: '25%', fontSize: '6.8pt', fontWeight: '800', color: '#334155', padding: '2.5px 6px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                                <span style={{ color: '#64748B', fontWeight: '600' }}>CÓDIGO:</span> SGC-RNC-001
                            </td>
                        </tr>
                        <tr>
                            <td style={{ fontSize: '6.8pt', fontWeight: '800', color: '#334155', padding: '2.5px 6px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                                <span style={{ color: '#64748B', fontWeight: '600' }}>VERSIÓN:</span> 003
                            </td>
                        </tr>
                        <tr>
                            <td style={{ fontSize: '6.8pt', fontWeight: '800', color: '#0D7A57', padding: '2.5px 6px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
                                <span style={{ color: '#64748B', fontWeight: '600' }}>RADICADO:</span> RNC #{consecutive}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ fontSize: '6.8pt', fontWeight: '800', color: '#334155', padding: '2.5px 6px', border: '1px solid #334155', backgroundColor: '#FFFFFF' }}>
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
                    borderLeft: '3.5px solid #0D7A57',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    marginBottom: '6px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={12} color="#0D7A57" />
                            <span style={{ fontSize: '7pt', fontWeight: '900', color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Estado de Calidad:
                            </span>
                        </div>
                        <span style={{
                            fontSize: '6.4pt',
                            fontWeight: '800',
                            padding: '1.5px 7px',
                            borderRadius: '3px',
                            backgroundColor: isResolved ? '#DCFCE7' : '#FEF3C7',
                            color: isResolved ? '#15803D' : '#B45309',
                            border: `1px solid ${isResolved ? '#86EFAC' : '#FDE68A'}`,
                            textTransform: 'uppercase'
                        }}>
                            {isResolved ? 'Dictaminado & Resuelto' : 'En Investigación Técnica'}
                        </span>
                    </div>
                    <div style={{ fontSize: '7pt', color: '#334155', fontWeight: '700' }}>
                        Pedido FruFresco: <strong style={{ color: '#0D7A57' }}>{orderSequence}</strong> • Radicado: <strong style={{ color: '#0F172A' }}>RNC #{consecutive}</strong>
                    </div>
                </div>

                {/* SECTION 1: CUSTOMER & LOGISTICS IDENTIFICATION */}
                <div className="page-break-avoid" style={{ marginBottom: '6px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: '#F1F5F9',
                        padding: '3px 6px',
                        borderRadius: '3px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '6.8pt',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                    }}>
                        <Building2 size={11} color="#0D7A57" />
                        <span>1. Identificación del Cliente y Despacho Logístico</span>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '4px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '6.6pt'
                    }}>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>Razón Social / Cliente:</span>
                            <div style={{ fontWeight: '800', color: '#0F172A' }}>{clientName}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>NIT / Identificación:</span>
                            <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientNit}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>Contacto / Ecónomo:</span>
                            <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientContact}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>Teléfono / Celular:</span>
                            <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientPhone}</div>
                        </div>
                        <div style={{ gridColumn: 'span 3', borderTop: '1px solid #F1F5F9', paddingTop: '3px' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>Dirección de Entrega:</span>
                            <div style={{ fontWeight: '600', color: '#334155' }}>{address}</div>
                        </div>
                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '3px' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>Radicado el:</span>
                            <div style={{ fontWeight: '700', color: '#0D7A57' }}>{creationDateFull}</div>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: TECHNICAL FINDING, ROOT CAUSE (RCA) & NOMINAL IMPUTATION */}
                <div className="page-break-avoid" style={{ marginBottom: '6px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: '#F1F5F9',
                        padding: '3px 6px',
                        borderRadius: '3px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '6.8pt',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                    }}>
                        <ShieldAlert size={11} color="#0D7A57" />
                        <span>2. Dictamen Técnico, Causa Raíz (RCA) e Imputabilidad Nominal</span>
                    </div>

                    <div style={{
                        border: '1px solid #CBD5E1',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        backgroundColor: '#FFFFFF',
                        fontSize: '6.6pt'
                    }}>
                        {/* RCA 3-Column Strip */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.3fr 2fr 1.1fr',
                            backgroundColor: '#F8FAFC',
                            padding: '3px 8px',
                            borderBottom: '1px solid #E2E8F0',
                            fontWeight: '800',
                            color: '#475569',
                            fontSize: '6pt',
                            textTransform: 'uppercase'
                        }}>
                            <div>Categoría Nivel 1 (RCA)</div>
                            <div>Subtipo de Falla (Nivel 2)</div>
                            <div>Área Responsable</div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.3fr 2fr 1.1fr',
                            padding: '4px 8px',
                            alignItems: 'center',
                            borderBottom: '1px solid #F1F5F9'
                        }}>
                            <div style={{ fontWeight: '800', color: '#0F172A' }}>
                                {catL1?.label || rca.categoryL1}
                            </div>
                            <div>
                                <span style={{ fontWeight: '700', color: '#334155' }}>
                                    {subtypeL2?.label || rca.subtypeL2 || 'Defecto técnico no codificado'}
                                </span>
                                {subtypeL2?.description && (
                                    <div style={{ fontSize: '5.8pt', color: '#64748B' }}>{subtypeL2.description}</div>
                                )}
                            </div>
                            <div>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '1.5px 6px',
                                    borderRadius: '3px',
                                    fontSize: '6pt',
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

                        {/* Nominal Imputed Entities Table (if exists) */}
                        {rca.imputedEntities && rca.imputedEntities.length > 0 && (
                            <div style={{ padding: '4px 8px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '6pt', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <Users size={10} />
                                    <span>Imputabilidad Nominal (Afectación Contable / Política de Nómina):</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.4pt', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left' }}>
                                            <th style={{ padding: '2px 5px', fontWeight: '800', color: '#475569' }}>Funcionario / Proveedor</th>
                                            <th style={{ padding: '2px 5px', fontWeight: '800', color: '#475569' }}>Cargo / Rol</th>
                                            <th style={{ padding: '2px 5px', fontWeight: '800', color: '#475569', textAlign: 'center' }}>% Imputado</th>
                                            <th style={{ padding: '2px 5px', fontWeight: '800', color: '#DC2626', textAlign: 'right' }}>Deducción COP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rca.imputedEntities.map((ent, eIdx) => (
                                            <tr key={ent.id || eIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '2px 5px', fontWeight: '800', color: '#0F172A' }}>
                                                    {ent.name} {ent.documentId ? `(Doc: ${ent.documentId})` : ''}
                                                </td>
                                                <td style={{ padding: '2px 5px', color: '#475569' }}>{ent.role || rca.responsible}</td>
                                                <td style={{ padding: '2px 5px', textAlign: 'center', fontWeight: '800', color: '#0D7A57' }}>{ent.sharePercent}%</td>
                                                <td style={{ padding: '2px 5px', textAlign: 'right', fontWeight: '900', color: '#DC2626' }}>
                                                    {ent.deductionAmount ? `$${ent.deductionAmount.toLocaleString('es-CO')} COP` : '$0 COP'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Problem Statement & Description */}
                        <div style={{ padding: '4px 8px', backgroundColor: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                            <div style={{ fontWeight: '800', color: '#0F172A', marginBottom: '1px' }}>
                                <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>ASUNTO RADICADO: </span>
                                {pqr.subject}
                            </div>
                            <div style={{ color: '#334155', lineHeight: '1.3', whiteSpace: 'pre-line' }}>
                                <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt' }}>HALLAZGO TÉCNICO / DESCRIPCIÓN: </span>
                                {pqr.description}
                            </div>
                            {rca.notes && rca.notes.trim() !== '' && (
                                <div style={{ color: '#0F172A', lineHeight: '1.3', whiteSpace: 'pre-line', marginTop: '3px', paddingTop: '3px', borderTop: '1px dashed #E2E8F0' }}>
                                    <span style={{ color: '#0D7A57', fontWeight: '800', textTransform: 'uppercase', fontSize: '5.8pt' }}>JUSTIFICACIÓN TÉCNICA DE CAUSA RAÍZ (INSPECCIÓN): </span>
                                    {rca.notes}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* SECTION 3: NON-CONFORMING ITEMS & COST OF QUALITY (CoQ) */}
                {novelties.length > 0 && (
                    <div className="page-break-avoid" style={{ marginBottom: '6px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F1F5F9',
                            padding: '3px 6px',
                            borderRadius: '3px',
                            borderLeft: '3px solid #0D7A57',
                            color: '#0F172A',
                            fontWeight: '800',
                            fontSize: '6.8pt',
                            textTransform: 'uppercase',
                            marginBottom: '4px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <FileText size={11} color="#0D7A57" />
                                <span>3. Relación de Ítems No Conformes y Costo de Calidad (CoQ)</span>
                            </div>
                            {totalImpactCoQ > 0 && (
                                <span style={{ fontSize: '6.4pt', fontWeight: '800', color: '#DC2626' }}>
                                    Impacto Total CoQ: ${totalImpactCoQ.toLocaleString('es-CO')} COP
                                </span>
                            )}
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.5pt', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #CBD5E1', textAlign: 'left' }}>
                                    <th style={{ padding: '2.5px 5px', color: '#475569', fontWeight: '800', width: '14%' }}>SKU</th>
                                    <th style={{ padding: '2.5px 5px', color: '#475569', fontWeight: '800', width: '40%' }}>Descripción de Ítem</th>
                                    <th style={{ padding: '2.5px 5px', color: '#475569', fontWeight: '800', textAlign: 'center', width: '14%' }}>Cant. Afectada</th>
                                    <th style={{ padding: '2.5px 5px', color: '#475569', fontWeight: '800', width: '20%' }}>Causal en Descarga</th>
                                    <th style={{ padding: '2.5px 5px', color: '#475569', fontWeight: '800', textAlign: 'right', width: '12%' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {novelties.map((item, idx) => (
                                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                        <td style={{ padding: '2.5px 5px', fontWeight: '700', color: '#64748B', fontFamily: 'monospace' }}>
                                            {item.products?.sku || 'N/A'}
                                        </td>
                                        <td style={{ padding: '2.5px 5px', fontWeight: '800', color: '#0F172A' }}>
                                            {item.products?.name || 'Producto'}
                                        </td>
                                        <td style={{ padding: '2.5px 5px', textAlign: 'center', fontWeight: '900', color: '#DC2626' }}>
                                            {item.quantity_returned} {item.products?.unit_of_measure || 'Kg'}
                                        </td>
                                        <td style={{ padding: '2.5px 5px', color: '#334155' }}>
                                            {item.reason || 'Sin observación'}
                                        </td>
                                        <td style={{ padding: '2.5px 5px', textAlign: 'right', fontWeight: '800', color: item.status === 'approved' ? '#15803D' : item.status === 'rejected' ? '#64748B' : '#B45309' }}>
                                            {item.status === 'approved' ? 'Aprobada' : item.status === 'rejected' ? 'Sin Costo' : 'En Revisión'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {totalImpactCoQ > 0 && (
                                <tfoot>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderTop: '1px solid #CBD5E1' }}>
                                        <td colSpan={2} style={{ padding: '2.5px 5px', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', fontSize: '6pt' }}>
                                            Total Impacto Contable
                                        </td>
                                        <td style={{ padding: '2.5px 5px', textAlign: 'center', fontWeight: '900', color: '#0F172A' }}>
                                            {novelties.reduce((acc, it) => acc + (Number(it.quantity_returned) || 0), 0)} Unidades
                                        </td>
                                        <td colSpan={2} style={{ padding: '2.5px 5px', textAlign: 'right', fontWeight: '900', color: '#DC2626', fontSize: '6.8pt' }}>
                                            Total CoQ: ${totalImpactCoQ.toLocaleString('es-CO')} COP
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}

                {/* SECTION 4: PHOTOGRAPHIC EVIDENCE (CALIBRATED COMPACT HEIGHT FOR CARTA) */}
                {photos.length > 0 && (
                    <div className="page-break-avoid" style={{ marginBottom: '6px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#F1F5F9',
                            padding: '3px 6px',
                            borderRadius: '3px',
                            borderLeft: '3px solid #0D7A57',
                            color: '#0F172A',
                            fontWeight: '800',
                            fontSize: '6.8pt',
                            textTransform: 'uppercase',
                            marginBottom: '4px'
                        }}>
                            <Camera size={11} color="#0D7A57" />
                            <span>4. Evidencia Fotográfica y Registro de Inspección</span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: photos.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                            gap: '6px'
                        }}>
                            {photos.slice(0, 2).map((url, i) => (
                                <div key={i} style={{
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '4px',
                                    padding: '3px',
                                    backgroundColor: '#FAFAFA',
                                    textAlign: 'center'
                                }}>
                                    <img
                                        src={url}
                                        alt={`Evidencia Fotográfica ${i + 1}`}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '62px',
                                            objectFit: 'contain',
                                            borderRadius: '3px',
                                            display: 'block',
                                            margin: '0 auto'
                                        }}
                                    />
                                    <div style={{ fontSize: '5.5pt', color: '#64748B', marginTop: '2px', fontWeight: '700' }}>
                                        Evidencia #{i + 1} • Inalterabilidad Probatoria SGC
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SECTION 5: CAPA, SANITARY DISPOSAL & TECHNICAL RESOLUTION */}
                <div className="page-break-avoid" style={{ marginBottom: '6px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: '#F1F5F9',
                        padding: '3px 6px',
                        borderRadius: '3px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '6.8pt',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                    }}>
                        <CheckCircle2 size={11} color="#0D7A57" />
                        <span>5. Dictamen Técnico, Plan de Acción (CAPA) y Disposición Sanitaria</span>
                    </div>

                    <div style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '6.6pt',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px'
                    }}>
                        {/* Concepto Comercial / Dictamen */}
                        {parsedResolution.commercialConcept && (
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                backgroundColor: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                width: 'fit-content'
                            }}>
                                <span style={{ fontSize: '5.8pt', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase' }}>
                                    Dictamen Comercial:
                                </span>
                                <span style={{ fontSize: '6.4pt', fontWeight: '700', color: '#15803D' }}>
                                    {parsedResolution.commercialConcept}
                                </span>
                            </div>
                        )}

                        {/* Protocolo de Disposición Sanitaria */}
                        {parsedResolution.sanitaryTitle ? (
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                borderRadius: '4px',
                                padding: '5px 7px'
                            }}>
                                <div style={{ fontSize: '6.2pt', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ShieldCheck size={11} color="#0D7A57" />
                                    <span>Protocolo Sanitario: {parsedResolution.sanitaryTitle}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '6.2pt', color: '#334155' }}>
                                    {parsedResolution.sanitaryDetails.map((detail, dIdx) => (
                                        <div key={dIdx} style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
                                            <span style={{ color: '#0D7A57', fontWeight: '900', lineHeight: '1.2' }}>•</span>
                                            <span style={{ lineHeight: '1.25' }}>{detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Observaciones Técnicas / CAPA Humanas */}
                        {parsedResolution.humanNotes ? (
                            <div style={{
                                borderTop: parsedResolution.sanitaryTitle ? '1px dashed #E2E8F0' : 'none',
                                paddingTop: parsedResolution.sanitaryTitle ? '4px' : '0',
                                color: '#1E293B',
                                lineHeight: '1.3'
                            }}>
                                <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '5.8pt', display: 'block', marginBottom: '1px' }}>
                                    Plan de Acción / Observaciones Técnicas:
                                </span>
                                <div style={{ fontWeight: '500', whiteSpace: 'pre-line' }}>
                                    {parsedResolution.humanNotes}
                                </div>
                            </div>
                        ) : !parsedResolution.sanitaryTitle ? (
                            <div style={{ color: '#64748B', fontStyle: 'italic' }}>
                                Caso cerrado conforme a los protocolos operativos estándar de calidad.
                            </div>
                        ) : null}

                        <div style={{
                            marginTop: '1px',
                            paddingTop: '4px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '5.8pt',
                            color: '#64748B',
                            fontWeight: '600'
                        }}>
                            <span>Dictaminado en Sistema SGC: <strong>{resolutionDate}</strong></span>
                            <span>Normativa Sanitaria: <strong>Res. 2674/2013 Invima • ISO 9001:2015</strong></span>
                        </div>
                    </div>
                </div>

                {/* SECTION 6: THREE-PARTY FORMAL LEGAL SIGNATURES */}
                <div className="page-break-avoid" style={{ marginBottom: '6px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: '#F1F5F9',
                        padding: '3px 6px',
                        borderRadius: '3px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '6.8pt',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                    }}>
                        <ShieldCheck size={11} color="#0D7A57" />
                        <span>6. Legalización y Cierre Formal de las Partes</span>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        textAlign: 'center'
                    }}>
                        {/* 1. Quality Assurance */}
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '4px', padding: '4px 6px', backgroundColor: '#FAFAFA' }}>
                            <div style={{ height: '24px', borderBottom: '1px solid #475569', marginBottom: '3px' }}></div>
                            <div style={{ fontWeight: '900', fontSize: '6.6pt', color: '#0F172A' }}>
                                Aseguramiento de Calidad
                            </div>
                            <div style={{ fontSize: '5.8pt', color: '#0D7A57', fontWeight: '700' }}>
                                {companyLegalName}
                            </div>
                            <div style={{ fontSize: '5.4pt', color: '#64748B' }}>
                                FruFresco SGC • Control Agroindustrial
                            </div>
                        </div>

                        {/* 2. Imputed Responsible / Acceptance */}
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '4px', padding: '4px 6px', backgroundColor: '#FAFAFA' }}>
                            <div style={{ height: '24px', borderBottom: '1px solid #475569', marginBottom: '3px' }}></div>
                            <div style={{ fontWeight: '900', fontSize: '6.6pt', color: '#0F172A' }}>
                                Responsable Imputado / Aceptación
                            </div>
                            <div style={{ fontSize: '5.8pt', color: '#B45309', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {rca.imputedEntities && rca.imputedEntities.length > 0 
                                    ? rca.imputedEntities.map(e => e.name).join(', ')
                                    : party.label}
                            </div>
                            <div style={{ fontSize: '5.4pt', color: '#64748B' }}>
                                C.C. / NIT • Aceptación Política de Nómina
                            </div>
                        </div>

                        {/* 3. Client Representative */}
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '4px', padding: '4px 6px', backgroundColor: '#FAFAFA' }}>
                            <div style={{ height: '24px', borderBottom: '1px solid #475569', marginBottom: '3px' }}></div>
                            <div style={{ fontWeight: '900', fontSize: '6.6pt', color: '#0F172A' }}>
                                Recibido Conforme Cliente
                            </div>
                            <div style={{ fontSize: '5.8pt', color: '#475569', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {clientName}
                            </div>
                            <div style={{ fontSize: '5.4pt', color: '#64748B' }}>
                                Firma / Sello / C.C.
                            </div>
                        </div>
                    </div>
                </div>

                {/* 7. CORPORATE DOCUMENT CONTROL LEGAL FOOTER */}
                <div style={{
                    marginTop: 'auto',
                    paddingTop: '4px',
                    borderTop: '1px solid #CBD5E1',
                    textAlign: 'center',
                    fontSize: '5.8pt',
                    color: '#64748B',
                    lineHeight: '1.3'
                }}>
                    <div>
                        <strong style={{ color: '#0F172A' }}>{companyLegalName}</strong> • {companyNit} • {companyAddress} • Tel: {companyPhone} • {companyEmail}
                    </div>
                    <div style={{ color: '#94A3B8', marginTop: '1px' }}>
                        Documento interno oficial del Sistema de Gestión de Calidad (SGC). Válido como sustento técnico para emisión de Notas Crédito, reposición logística de inventario y auditorías de certificación ISO 9001 / BPM.
                    </div>
                </div>
            </div>
        </div>
    );
}
