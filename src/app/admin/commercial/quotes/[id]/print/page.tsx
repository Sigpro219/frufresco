'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';

export default function PrintQuotePage() {
    const params = useParams();
    const [quote, setQuote] = useState<any>(null);
    const [lead, setLead] = useState<any>(null);
    const [clientInfo, setClientInfo] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [appSettings, setAppSettings] = useState({
        provider_legal_name: 'Investments Cortés S.A.S.',
        provider_nit: '901.393.217',
        provider_logo_url: '/logo-investments.png',
        provider_address: 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C., Colombia',
        provider_email: 'contacto@investmentscortes.com',
        app_name: 'FruFresco',
        app_logo_url: '',
        primary_color: '#15803D',
        secondary_color: '#64748B'
    });

    useEffect(() => {
        if (params.id) {
            loadAllData();
        }
    }, [params.id]);

    const loadAllData = async () => {
        setLoading(true);
        try {
            // Load App Settings
            const { data: sData } = await supabase.from('app_settings').select('*');
            if (sData) {
                const settingsMap: Record<string, string> = {};
                sData.forEach((s: any) => { settingsMap[s.key] = s.value; });
                setAppSettings(prev => ({ ...prev, ...settingsMap }));
            }

            // Load Quote
            const { data: qData, error: qErr } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', params.id)
                .single();

            if (qErr) throw qErr;
            setQuote(qData);

            // Load Lead Info if exists
            if (qData.lead_id) {
                const { data: lData } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('id', qData.lead_id)
                    .single();
                if (lData) setLead(lData);
            }

            // Load Client Info if exists
            if (qData.client_id) {
                const { data: cData } = await supabase
                    .from('profiles')
                    .select('company_name, contact_name, nit, phone, address')
                    .eq('id', qData.client_id)
                    .single();
                if (cData) setClientInfo(cData);
            }

            // Load Items
            const { data: iData } = await supabase
                .from('quote_items')
                .select('*, products(name)')
                .eq('quote_id', params.id);

            if (iData) setItems(iData);
        } catch (error) {
            console.error('Error loading print data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!loading && quote) {
            const timer = setTimeout(() => {
                window.print();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [loading, quote]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#64748B' }}>
                <div>Generando cotización para impresión comercial...</div>
            </div>
        );
    }

    if (!quote) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#EF4444' }}>
                Error: No se pudo cargar el documento de cotización.
            </div>
        );
    }

    return (
        <div className="print-container">
            {/* Styles to inject print specifics */}
            <style dangerouslySetInnerHTML={{ __html: `
                body {
                    background-color: white !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    color: #0F172A !important;
                    font-family: system-ui, -apple-system, sans-serif !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .print-container {
                    padding: 1.5cm;
                    max-width: 800px;
                    margin: 0 auto;
                    position: relative;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    padding: 10px 8px;
                    text-align: left;
                }
                tr.item-row {
                    border-bottom: 1px solid #E2E8F0;
                }
                @media print {
                    body {
                        background-color: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .print-container {
                        padding: 0;
                        max-width: 100%;
                    }
                    footer.print-footer {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        font-size: 0.75rem;
                        color: #94A3B8;
                        text-align: right;
                        padding-top: 10px;
                        border-top: 1px solid #E2E8F0;
                        display: block !important;
                    }
                }
                @page {
                    size: letter;
                    margin: 1.5cm;
                }
                footer.print-footer {
                    display: none;
                }
            ` }} />

            {/* Watermark in background */}
            <div style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-30deg)',
                width: '450px',
                height: '450px',
                backgroundImage: `url(${appSettings.provider_logo_url || appSettings.app_logo_url})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'contain',
                opacity: 0.03,
                pointerEvents: 'none',
                zIndex: 0
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        {(appSettings.provider_logo_url || appSettings.app_logo_url) && (
                            <img src={appSettings.provider_logo_url || appSettings.app_logo_url} alt="Logo" style={{ maxHeight: '75px', objectFit: 'contain' }} />
                        )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#475569', lineHeight: '1.4' }}>
                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '1.1rem' }}>{appSettings.provider_legal_name || 'Investments Cortés S.A.S.'}</div>
                        <div>NIT: {appSettings.provider_nit || '901.393.217'}</div>
                        <div>{appSettings.provider_address || 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C.'}</div>
                        <div>{appSettings.provider_email || 'contacto@investmentscortes.com'}</div>
                    </div>
                </div>

                {/* Solid Divider */}
                <div style={{ borderTop: `3px solid ${appSettings.primary_color || '#15803D'}`, margin: '1.5rem 0 2rem 0' }}></div>

                {/* Metadata block */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
                    <div style={{ width: '50%' }}>
                        <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Propuesta para:</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.25rem' }}>{quote.client_name}</div>
                        {clientInfo ? (
                            <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                                {clientInfo.company_name && <div>{clientInfo.company_name}</div>}
                                {clientInfo.contact_name && <div>Atención: {clientInfo.contact_name}</div>}
                                {clientInfo.phone && <div>Teléfono: {clientInfo.phone}</div>}
                                {clientInfo.address && <div>Dirección: {clientInfo.address}</div>}
                            </div>
                        ) : lead ? (
                            <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                                {lead.company_name && <div>{lead.company_name}</div>}
                                {lead.contact_name && <div>Atención: {lead.contact_name}</div>}
                                {lead.phone && <div>Teléfono: {lead.phone}</div>}
                                {lead.email && <div>Email: {lead.email}</div>}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.9rem', color: '#64748B', fontStyle: 'italic' }}>Consumidor Final</div>
                        )}
                    </div>
                    <div style={{ width: '50%', textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Cotización Oficial</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.25rem' }}>N° #{quote.quote_number}</div>
                        <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                            <div>Fecha: {quote.start_date || new Date(quote.created_at).toISOString().split('T')[0]}</div>
                            <div>Validez: 30 días</div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <table style={{ marginBottom: '3rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#94A3B8' }}>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '5%' }}>#</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '50%' }}>Descripción del Item</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '15%', textAlign: 'center' }}>Tipo</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%', textAlign: 'center' }}>Cant.</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%', textAlign: 'right' }}>Valor Unitario</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%', textAlign: 'right' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const isService = item.product_name?.toLowerCase().includes('servicio') || item.product_name?.toLowerCase().includes('consultor');
                            const typeLabel = isService ? 'SERVICIO' : 'BIEN';
                            const typeColor = isService ? '#475569' : '#16A34A';
                            const typeBg = isService ? '#F1F5F9' : '#DCFCE7';

                            return (
                                <tr key={item.id || index} className="item-row">
                                    <td style={{ fontSize: '1.1rem', fontWeight: '800', color: '#CBD5E1' }}>
                                        {String(index + 1).padStart(2, '0')}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.95rem' }}>{item.product_name || item.products?.name}</div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ 
                                            display: 'inline-block',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            backgroundColor: typeBg,
                                            color: typeColor,
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em'
                                        }}>{typeLabel}</span>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: '700', color: '#0F172A' }}>
                                        {item.quantity}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#0F172A' }}>
                                        ${Math.ceil(item.unit_price).toLocaleString()}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '800', color: '#0F172A' }}>
                                        ${Math.ceil(item.total_price).toLocaleString()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ color: '#475569' }}>
                            <td colSpan={4}></td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: '700', fontSize: '0.9rem' }}>Subtotal</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: '700', fontSize: '1.05rem', color: '#0F172A' }}>
                                ${Math.ceil(quote.subtotal_amount).toLocaleString()}
                            </td>
                        </tr>
                        <tr style={{ color: '#64748B' }}>
                            <td colSpan={4}></td>
                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.85rem' }}>Impuestos (IVA)</td>
                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.95rem' }}>
                                ${Math.ceil(quote.total_tax_amount).toLocaleString()}
                            </td>
                        </tr>
                        <tr style={{ backgroundColor: '#F8FAFC', color: '#0F172A', borderTop: '1px solid #E2E8F0' }}>
                            <td colSpan={4}></td>
                            <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: '900', fontSize: '1rem' }}>Total General</td>
                            <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: '900', fontSize: '1.4rem', color: appSettings.primary_color || '#15803D' }}>
                                ${Math.ceil(quote.total_amount).toLocaleString()}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* Print Footer */}
                <footer className="print-footer">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{appSettings.provider_legal_name || 'Investments Cortés S.A.S.'} - Cotización Oficial</span>
                        <span>Página 1</span>
                    </div>
                </footer>
            </div>
        </div>
    );
}
