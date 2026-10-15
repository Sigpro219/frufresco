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
import UniversalLetterhead from '@/components/print/UniversalLetterhead';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { 
    Printer, ArrowLeft, ShieldAlert, CheckCircle2, FileText, 
    Building2, User, Phone, MapPin, Calendar, Camera, 
    ShieldCheck, Users 
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
    const brandConfig = {
        ...INVESTMENTS_CORTES_BRAND,
        companyName: appSettings.provider_legal_name || INVESTMENTS_CORTES_BRAND.companyName,
        legalId: appSettings.provider_nit 
            ? (appSettings.provider_nit.includes('NIT') ? appSettings.provider_nit : `NIT ${appSettings.provider_nit}`)
            : INVESTMENTS_CORTES_BRAND.legalId,
        logoUrl: appSettings.provider_logo_url || INVESTMENTS_CORTES_BRAND.logoUrl,
        watermarkUrl: appSettings.provider_logo_url || INVESTMENTS_CORTES_BRAND.watermarkUrl,
        headquarters: {
            ...INVESTMENTS_CORTES_BRAND.headquarters,
            address: appSettings.provider_address || INVESTMENTS_CORTES_BRAND.headquarters?.address,
            email: appSettings.provider_email || INVESTMENTS_CORTES_BRAND.headquarters?.email,
            mobile: appSettings.provider_phone || INVESTMENTS_CORTES_BRAND.headquarters?.mobile,
        }
    };

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
    const cleanNotes = cleanHumanResolutionNotes(pqr.resolution_notes || '');
    const parsedResolution = parseSanitaryAndHumanNotes(pqr.resolution_notes || '', rca.notes);

    return (
        <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '1.5rem 1rem' }}>
            {/* Screen Action Toolbar */}
            <div className="no-print" style={{
                maxWidth: '850px',
                margin: '0 auto 1.25rem auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                padding: '0.75rem 1.25rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
            }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 14px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        color: '#334155',
                        fontWeight: '700',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                    }}
                >
                    <ArrowLeft size={15} /> Volver a Gestión de Calidad
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '600' }}>
                        Estándar Golden Print • Investments Cortés S.A.S.
                    </span>
                    <button
                        onClick={() => window.print()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 18px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
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

            {/* Canonical Golden Print Wrapper */}
            <UniversalLetterhead
                brand={brandConfig}
                paperSize="letter"
                meta={{
                    title: 'REPORTE DE SALIDA NO CONFORME (RNC)',
                    subtitle: 'CONTROL DE CALIDAD AGROINDUSTRIAL • ISO 9001:2015 (8.7) • BPM INVIMA RES. 2674/2013',
                    reference: `RNC #${consecutive}`,
                    date: creationDateOnly,
                    badge: isResolved ? 'DICTAMINADO & RESUELTO' : 'EN INVESTIGACIÓN TÉCNICA',
                    badgeVariant: isResolved ? 'emerald' : 'amber',
                    operationalTag: {
                        label: 'PEDIDO',
                        value: orderSequence
                    }
                }}
            >
                {/* 1. SECCIÓN IDENTIFICACIÓN DEL CLIENTE Y DESPACHO LOGÍSTICO */}
                <div className="page-break-avoid" style={{ marginBottom: '10px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F1F5F9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        marginBottom: '6px'
                    }}>
                        <Building2 size={13} color="#0D7A57" />
                        <span>1. Identificación del Cliente y Despacho Logístico</span>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '6px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '0.68rem'
                    }}>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>Razón Social / Cliente:</span>
                            <div style={{ fontWeight: '800', color: '#0F172A' }}>{clientName}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>NIT / Identificación:</span>
                            <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientNit}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>Contacto / Ecónomo:</span>
                            <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientContact}</div>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>Teléfono / Celular:</span>
                            <div style={{ fontWeight: '700', color: '#1E293B' }}>{clientPhone}</div>
                        </div>
                        <div style={{ gridColumn: 'span 3', borderTop: '1px solid #F1F5F9', paddingTop: '4px' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>Dirección de Entrega:</span>
                            <div style={{ fontWeight: '600', color: '#334155' }}>{address}</div>
                        </div>
                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '4px' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>Radicado el:</span>
                            <div style={{ fontWeight: '700', color: '#0D7A57' }}>{creationDateFull}</div>
                        </div>
                    </div>
                </div>

                {/* 2. SECCIÓN DICTAMEN TÉCNICO, CAUSA RAÍZ (RCA) E IMPUTABILIDAD */}
                <div className="page-break-avoid" style={{ marginBottom: '10px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F1F5F9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        marginBottom: '6px'
                    }}>
                        <ShieldAlert size={13} color="#0D7A57" />
                        <span>2. Dictamen Técnico, Causa Raíz (RCA) e Imputabilidad Nominal</span>
                    </div>

                    <div style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        backgroundColor: '#FFFFFF',
                        fontSize: '0.68rem'
                    }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.4fr 2fr 1.2fr',
                            backgroundColor: '#F8FAFC',
                            padding: '5px 10px',
                            borderBottom: '1px solid #E2E8F0',
                            fontWeight: '800',
                            color: '#475569',
                            fontSize: '0.62rem',
                            textTransform: 'uppercase'
                        }}>
                            <div>Categoría Nivel 1 (RCA)</div>
                            <div>Subtipo de Falla (Nivel 2)</div>
                            <div>Área Responsable</div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.4fr 2fr 1.2fr',
                            padding: '6px 10px',
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
                                    <div style={{ fontSize: '0.60rem', color: '#64748B' }}>{subtypeL2.description}</div>
                                )}
                            </div>
                            <div>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.62rem',
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

                        {/* Tabla de Responsables Imputados Nominales */}
                        {rca.imputedEntities && rca.imputedEntities.length > 0 && (
                            <div style={{ padding: '6px 10px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Users size={11} />
                                    <span>Imputabilidad Nominal (Afectación Contable / Política de Nómina):</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left' }}>
                                            <th style={{ padding: '3px 6px', fontWeight: '800', color: '#475569' }}>Funcionario / Proveedor</th>
                                            <th style={{ padding: '3px 6px', fontWeight: '800', color: '#475569' }}>Cargo / Rol</th>
                                            <th style={{ padding: '3px 6px', fontWeight: '800', color: '#475569', textAlign: 'center' }}>% Imputado</th>
                                            <th style={{ padding: '3px 6px', fontWeight: '800', color: '#DC2626', textAlign: 'right' }}>Deducción COP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rca.imputedEntities.map((ent, eIdx) => (
                                            <tr key={ent.id || eIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '3px 6px', fontWeight: '800', color: '#0F172A' }}>
                                                    {ent.name} {ent.documentId ? `(Doc: ${ent.documentId})` : ''}
                                                </td>
                                                <td style={{ padding: '3px 6px', color: '#475569' }}>{ent.role || rca.responsible}</td>
                                                <td style={{ padding: '3px 6px', textAlign: 'center', fontWeight: '800', color: '#0D7A57' }}>{ent.sharePercent}%</td>
                                                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: '900', color: '#DC2626' }}>
                                                    {ent.deductionAmount ? `$${ent.deductionAmount.toLocaleString('es-CO')} COP` : '$0 COP'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Declaración del Problema & Hallazgo */}
                        <div style={{ padding: '6px 10px', backgroundColor: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                            <div style={{ fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>
                                <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>ASUNTO RADICADO: </span>
                                {pqr.subject}
                            </div>
                            <div style={{ color: '#334155', lineHeight: '1.35', whiteSpace: 'pre-line' }}>
                                <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem' }}>HALLAZGO TÉCNICO / DESCRIPCIÓN: </span>
                                {pqr.description}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. SECCIÓN RELACIÓN DE PRODUCTO NO CONFORME Y COSTO DE CALIDAD (CoQ) */}
                {novelties.length > 0 && (
                    <div className="page-break-avoid" style={{ marginBottom: '10px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F1F5F9',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            borderLeft: '3px solid #0D7A57',
                            color: '#0F172A',
                            fontWeight: '800',
                            fontSize: '0.72rem',
                            textTransform: 'uppercase',
                            marginBottom: '6px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={13} color="#0D7A57" />
                                <span>3. Relación de Ítems No Conformes y Costo de Calidad (CoQ)</span>
                            </div>
                            {totalImpactCoQ > 0 && (
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#DC2626' }}>
                                    Impacto Total CoQ: ${totalImpactCoQ.toLocaleString('es-CO')} COP
                                </span>
                            )}
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.66rem', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                                    <th style={{ padding: '4px 6px', color: '#475569', fontWeight: '800', width: '14%' }}>SKU</th>
                                    <th style={{ padding: '4px 6px', color: '#475569', fontWeight: '800', width: '38%' }}>Descripción de Ítem</th>
                                    <th style={{ padding: '4px 6px', color: '#475569', fontWeight: '800', textAlign: 'center', width: '14%' }}>Cant. Afectada</th>
                                    <th style={{ padding: '4px 6px', color: '#475569', fontWeight: '800', width: '22%' }}>Causal en Descarga</th>
                                    <th style={{ padding: '4px 6px', color: '#475569', fontWeight: '800', textAlign: 'right', width: '12%' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {novelties.map((item, idx) => (
                                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                        <td style={{ padding: '4px 6px', fontWeight: '700', color: '#64748B', fontFamily: 'monospace' }}>
                                            {item.products?.sku || 'N/A'}
                                        </td>
                                        <td style={{ padding: '4px 6px', fontWeight: '800', color: '#0F172A' }}>
                                            {item.products?.name || 'Producto'}
                                        </td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: '900', color: '#DC2626' }}>
                                            {item.quantity_returned} {item.products?.unit_of_measure || 'Kg'}
                                        </td>
                                        <td style={{ padding: '4px 6px', color: '#334155' }}>
                                            {item.reason || 'Sin observación'}
                                        </td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: '800', color: item.status === 'approved' ? '#15803D' : item.status === 'rejected' ? '#64748B' : '#B45309' }}>
                                            {item.status === 'approved' ? 'Aprobada' : item.status === 'rejected' ? 'Sin Costo' : 'En Revisión'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {totalImpactCoQ > 0 && (
                                <tfoot>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderTop: '1.5px solid #CBD5E1' }}>
                                        <td colSpan={2} style={{ padding: '4px 6px', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', fontSize: '0.62rem' }}>
                                            Total Impacto Contable
                                        </td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: '900', color: '#0F172A' }}>
                                            {novelties.reduce((acc, it) => acc + (Number(it.quantity_returned) || 0), 0)} Unidades
                                        </td>
                                        <td colSpan={2} style={{ padding: '4px 6px', textAlign: 'right', fontWeight: '900', color: '#DC2626', fontSize: '0.72rem' }}>
                                            Total CoQ: ${totalImpactCoQ.toLocaleString('es-CO')} COP
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}

                {/* 4. SECCIÓN EVIDENCIA FOTOGRÁFICA */}
                {photos.length > 0 && (
                    <div className="page-break-avoid" style={{ marginBottom: '10px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#F1F5F9',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            borderLeft: '3px solid #0D7A57',
                            color: '#0F172A',
                            fontWeight: '800',
                            fontSize: '0.72rem',
                            textTransform: 'uppercase',
                            marginBottom: '6px'
                        }}>
                            <Camera size={13} color="#0D7A57" />
                            <span>4. Evidencia Fotográfica y Registro de Inspección</span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: photos.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                            gap: '8px'
                        }}>
                            {photos.slice(0, 4).map((url, i) => (
                                <div key={i} style={{
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '6px',
                                    padding: '4px',
                                    backgroundColor: '#FAFAFA',
                                    textAlign: 'center'
                                }}>
                                    <img
                                        src={url}
                                        alt={`Evidencia Fotográfica ${i + 1}`}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '130px',
                                            objectFit: 'contain',
                                            borderRadius: '4px',
                                            display: 'block',
                                            margin: '0 auto'
                                        }}
                                    />
                                    <div style={{ fontSize: '0.58rem', color: '#64748B', marginTop: '3px', fontWeight: '700' }}>
                                        Evidencia #{i + 1} • Inalterabilidad SGC
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 5. SECCIÓN PLAN DE ACCIÓN (CAPA) Y DISPOSICIÓN SANITARIA */}
                <div className="page-break-avoid" style={{ marginBottom: '12px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F1F5F9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        marginBottom: '6px'
                    }}>
                        <CheckCircle2 size={13} color="#0D7A57" />
                        <span>5. Dictamen Técnico, Plan de Acción (CAPA) y Disposición Sanitaria</span>
                    </div>

                    <div style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '0.68rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {/* Concepto Comercial / Dictamen */}
                        {parsedResolution.commercialConcept && (
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                width: 'fit-content'
                            }}>
                                <span style={{ fontSize: '0.60rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase' }}>
                                    Dictamen Comercial:
                                </span>
                                <span style={{ fontSize: '0.66rem', fontWeight: '700', color: '#15803D' }}>
                                    {parsedResolution.commercialConcept}
                                </span>
                            </div>
                        )}

                        {/* Protocolo de Disposición Sanitaria */}
                        {parsedResolution.sanitaryTitle ? (
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                borderRadius: '5px',
                                padding: '6px 8px'
                            }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <ShieldCheck size={12} color="#0D7A57" />
                                    <span>Protocolo Sanitario: {parsedResolution.sanitaryTitle}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.64rem', color: '#334155' }}>
                                    {parsedResolution.sanitaryDetails.map((detail, dIdx) => (
                                        <div key={dIdx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                            <span style={{ color: '#0D7A57', fontWeight: '900', lineHeight: '1.2' }}>•</span>
                                            <span style={{ lineHeight: '1.3' }}>{detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Observaciones Humanas / Hallazgo Técnico / CAPA */}
                        {parsedResolution.humanNotes ? (
                            <div style={{
                                borderTop: parsedResolution.sanitaryTitle ? '1px dashed #E2E8F0' : 'none',
                                paddingTop: parsedResolution.sanitaryTitle ? '6px' : '0',
                                color: '#1E293B',
                                lineHeight: '1.4'
                            }}>
                                <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.60rem', display: 'block', marginBottom: '2px' }}>
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
                            marginTop: '2px',
                            paddingTop: '6px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.60rem',
                            color: '#64748B',
                            fontWeight: '600'
                        }}>
                            <span>Dictaminado en Sistema SGC: <strong>{resolutionDate}</strong></span>
                            <span>Normativa Sanitaria: <strong>Res. 2674/2013 Invima • ISO 9001:2015</strong></span>
                        </div>
                    </div>
                </div>

                {/* 6. SECCIÓN LEGALIZACIÓN Y TRIÁNGULO DE FIRMAS */}
                <div className="page-break-avoid" style={{ marginTop: '12px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F1F5F9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        borderLeft: '3px solid #0D7A57',
                        color: '#0F172A',
                        fontWeight: '800',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        marginBottom: '8px'
                    }}>
                        <ShieldCheck size={13} color="#0D7A57" />
                        <span>6. Legalización y Cierre Formal de las Partes</span>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '10px',
                        textAlign: 'center'
                    }}>
                        {/* 1. Quality Assurance */}
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px', backgroundColor: '#FAFAFA' }}>
                            <div style={{ height: '32px', borderBottom: '1px solid #475569', marginBottom: '4px' }}></div>
                            <div style={{ fontWeight: '900', fontSize: '0.68rem', color: '#0F172A' }}>
                                Aseguramiento de Calidad
                            </div>
                            <div style={{ fontSize: '0.60rem', color: '#0D7A57', fontWeight: '700' }}>
                                {brandConfig.companyName}
                            </div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B' }}>
                                FruFresco SGC • Control Agroindustrial
                            </div>
                        </div>

                        {/* 2. Imputed Responsible / Acceptance */}
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px', backgroundColor: '#FAFAFA' }}>
                            <div style={{ height: '32px', borderBottom: '1px solid #475569', marginBottom: '4px' }}></div>
                            <div style={{ fontWeight: '900', fontSize: '0.68rem', color: '#0F172A' }}>
                                Responsable Imputado / Aceptación
                            </div>
                            <div style={{ fontSize: '0.60rem', color: '#B45309', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {rca.imputedEntities && rca.imputedEntities.length > 0 
                                    ? rca.imputedEntities.map(e => e.name).join(', ')
                                    : party.label}
                            </div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B' }}>
                                C.C. / NIT • Aceptación Política de Nómina
                            </div>
                        </div>

                        {/* 3. Client Representative */}
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px', backgroundColor: '#FAFAFA' }}>
                            <div style={{ height: '32px', borderBottom: '1px solid #475569', marginBottom: '4px' }}></div>
                            <div style={{ fontWeight: '900', fontSize: '0.68rem', color: '#0F172A' }}>
                                Recibido Conforme Cliente
                            </div>
                            <div style={{ fontSize: '0.60rem', color: '#475569', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {clientName}
                            </div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B' }}>
                                Firma / Sello / C.C.
                            </div>
                        </div>
                    </div>
                </div>
            </UniversalLetterhead>
        </div>
    );
}
