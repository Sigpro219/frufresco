'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Letterhead from '@/components/Letterhead';
import { CheckCircle2, Building2, Calendar, Tag, ShieldCheck } from 'lucide-react';

export default function PrintAgreementPage() {
    const params = useParams();
    const [agreement, setAgreement] = useState<any>(null);
    const [clientProfile, setClientProfile] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [logoLoaded, setLogoLoaded] = useState(false);

    const formatPrice = (val: number | string | null | undefined): string => {
        const num = Math.round(Number(val) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    useEffect(() => {
        if (params.id) {
            loadAgreementData();
        }
    }, [params.id]);

    const loadAgreementData = async () => {
        setLoading(true);
        try {
            // 1. App Settings
            const { data: sData } = await supabase.from('app_settings').select('*');
            const settingsMap: Record<string, string> = {};
            if (sData) {
                sData.forEach((s: any) => { settingsMap[s.key] = s.value; });
            }

            // 2. Agreement Record
            const { data: qData, error: qErr } = await supabase
                .from('quotes')
                .select('*, pricing_models(*)')
                .eq('id', params.id)
                .single();

            if (qErr) throw qErr;
            setAgreement(qData);

            // 3. Client Profile Info
            if (qData.client_id) {
                const { data: cData } = await supabase
                    .from('profiles')
                    .select('company_name, contact_name, nit, phone, address')
                    .eq('id', qData.client_id)
                    .single();
                if (cData) setClientProfile(cData);
            }

            // 4. Agreement Items
            const { data: iData } = await supabase
                .from('quote_items')
                .select('*, products(name, name_en, unit_of_measure, base_price)')
                .eq('quote_id', params.id);

            if (iData) setItems(iData);

            // 5. Preload Logo Image for Vector Print
            const logoUrl = settingsMap.provider_logo_url || settingsMap.app_logo_url || '/logo-investments.png';
            if (logoUrl) {
                const img = new Image();
                img.onload = () => setLogoLoaded(true);
                img.onerror = () => setLogoLoaded(true);
                img.src = logoUrl;
            } else {
                setLogoLoaded(true);
            }
        } catch (err) {
            console.error('Error cargando documento de acuerdo:', err);
            setLogoLoaded(true);
        } finally {
            setLoading(false);
        }
    };

    // Auto-trigger window.print() once data and images are fully loaded
    useEffect(() => {
        if (!loading && agreement && logoLoaded) {
            const refCode = agreement.quote_number
                ? `ACU-${agreement.quote_number}`
                : `ACU-${String(agreement.id).substring(0, 8).toUpperCase()}`;
            document.title = `Acuerdo Comercial - ${clientProfile?.company_name || agreement.client_name || refCode}`;
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [loading, agreement, logoLoaded, clientProfile]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#64748B' }}>
                <div>Generando Documento Formal de Acuerdo Comercial...</div>
            </div>
        );
    }

    if (!agreement) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#EF4444' }}>
                Error: No se pudo cargar el documento del acuerdo comercial.
            </div>
        );
    }

    const createdDate = agreement.created_at
        ? new Date(agreement.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Fecha N/A';

    const validUntilDate = agreement.valid_until
        ? new Date(agreement.valid_until).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Vigencia Continua (Renovación Trimestral)';

    const refCode = agreement.quote_number
        ? `ACU-${agreement.quote_number}`
        : `ACU-${String(agreement.id).substring(0, 8).toUpperCase()}`;

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

    return (
        <div className="print-agreement-page">
            <style dangerouslySetInnerHTML={{ __html: `
                * { box-sizing: border-box; }
                @page {
                    size: letter portrait;
                    margin: 10mm;
                }
                body {
                    background-color: white;
                    margin: 0;
                    padding: 0;
                    color: #0F172A;
                    font-family: 'Inter', -apple-system, sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .agreement-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 1rem;
                    margin-bottom: 1.5rem;
                }
                .agreement-table th {
                    background-color: #0D7A57 !important;
                    color: white !important;
                    text-align: left;
                    padding: 0.6rem 0.8rem;
                    font-size: 0.78rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .agreement-table td {
                    padding: 0.6rem 0.8rem;
                    border-bottom: 1px solid #F1F5F9;
                    font-size: 0.85rem;
                }
                .agreement-table tr {
                    page-break-inside: avoid;
                }
            ` }} />

            <Letterhead
                title="ACUERDO COMERCIAL INSTITUCIONAL"
                date={createdDate}
                reference={refCode}
            >
                {/* 2-COLUMN METADATA BOX (COMPACT Y-AXIS) */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr',
                    gap: '1rem',
                    backgroundColor: '#F8FAFC',
                    padding: '0.85rem 1.1rem',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    marginBottom: '1rem'
                }}>
                    {/* Left Column: Client Info */}
                    <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                            DATOS DEL CLIENTE INSTITUCIONAL
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>
                            {clientProfile?.company_name || agreement.client_name || 'Cliente Registrado'}
                        </div>
                        {clientProfile?.nit && (
                            <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '600', marginTop: '1px' }}>
                                NIT / CC: {clientProfile.nit}
                            </div>
                        )}
                        {clientProfile?.address && (
                            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '1px' }}>
                                Dirección: {clientProfile.address}
                            </div>
                        )}
                        {clientProfile?.contact_name && (
                            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '1px' }}>
                                Contacto: {clientProfile.contact_name}
                            </div>
                        )}
                    </div>

                    {/* Right Column: Agreement Details */}
                    <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                            ESPECIFICACIONES DEL CONVENIO
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0D7A57' }}>
                            {agreement.model_snapshot_name || agreement.pricing_models?.name || 'Convenio Tarifa Preferencial'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '600', marginTop: '1px' }}>
                            📅 Vigencia: <strong>{validUntilDate}</strong>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '600', marginTop: '1px' }}>
                            📦 Portafolio: <strong>{items.length} Insumos Preferenciales</strong> (~{avgSavingsPct}% Ahorro)
                        </div>
                        <div style={{ marginTop: '4px' }}>
                            <span style={{
                                backgroundColor: '#DCFCE7',
                                color: '#15803D',
                                fontSize: '0.68rem',
                                fontWeight: '800',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                textTransform: 'uppercase'
                            }}>
                                <CheckCircle2 size={11} /> Acuerdo Vigente y Activo
                            </span>
                        </div>
                    </div>
                </div>

                {/* AGREEMENT ITEMS TABLE - 4 CLEAN COLUMNS ONLY */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Portafolio de Insumos Incluidos en el Convenio ({items.length})
                    </div>

                    <table className="agreement-table">
                        <thead>
                            <tr>
                                <th style={{ width: '35px', textAlign: 'center', padding: '0.45rem 0.6rem' }}>#</th>
                                <th style={{ padding: '0.45rem 0.6rem' }}>Insumo / Producto Institucional</th>
                                <th style={{ textAlign: 'center', width: '90px', padding: '0.45rem 0.6rem' }}>Unidad</th>
                                <th style={{ textAlign: 'right', width: '180px', padding: '0.45rem 0.6rem' }}>Precio Pactado Convenio</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, idx) => {
                                const p = it.products;
                                const name = it.product_name || p?.name || 'Producto';
                                const unit = p?.unit_of_measure || 'Kg';
                                const uPrice = Number(it.unit_price || 0);

                                return (
                                    <tr key={it.id || idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                        <td style={{ textAlign: 'center', color: '#64748B', fontWeight: '700', padding: '0.4rem 0.6rem' }}>{idx + 1}</td>
                                        <td style={{ color: '#0F172A', fontWeight: '800', padding: '0.4rem 0.6rem' }}>{name}</td>
                                        <td style={{ textAlign: 'center', color: '#475569', fontWeight: '600', padding: '0.4rem 0.6rem' }}>{unit}</td>
                                        <td style={{ textAlign: 'right', color: '#0D7A57', fontWeight: '900', fontSize: '0.92rem', padding: '0.4rem 0.6rem' }}>
                                            ${formatPrice(uPrice)} <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>/ {unit}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* TERMS & CONDITIONS BOX (COMPACT) */}
                <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderLeft: '4px solid #0D7A57',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    marginTop: '1.25rem'
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldCheck size={13} color="#0D7A57" /> TÉRMINOS Y GARANTÍAS DEL CONVENIO INSTITUCIONAL
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', lineHeight: 1.45 }}>
                        <li><strong>Garantía de Precio Fijo</strong>: Las tarifas pactadas son fijas durante la vigencia del acuerdo y no sufren incrementos por fluctuación de mercado.</li>
                        <li><strong>Autogestión B2B</strong>: Válido para todos los pedidos realizados a través del portal de autogestión de FruFresco.</li>
                        <li><strong>Despacho Prioritario</strong>: Acceso a entregas con control de calidad digital en bodega y prioridad de despacho.</li>
                    </ul>
                </div>
            </Letterhead>
        </div>
    );
}
