'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';

export default function PrintQuotePage() {
    const formatPrice = (value: number) => {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(value);
    };

    const formatQuoteNumber = (seq: number, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        return `COT ${day}${month} ${paddedSeq}`;
    };

    const params = useParams();
    const [quote, setQuote] = useState<any>(null);
    const [lead, setLead] = useState<any>(null);
    const [clientInfo, setClientInfo] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [logoLoaded, setLogoLoaded] = useState(false);
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
            const settingsMap: Record<string, string> = {};
            if (sData) {
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
                .select('*, products(name, unit_of_measure)')
                .eq('quote_id', params.id);

            if (iData) setItems(iData);

            // Preload logo
            const logoUrl = settingsMap.provider_logo_url || settingsMap.app_logo_url || '/logo-investments.png';
            if (logoUrl) {
                const img = new Image();
                img.onload = () => setLogoLoaded(true);
                img.onerror = () => setLogoLoaded(true);
                img.src = logoUrl;
            } else {
                setLogoLoaded(true);
            }
        } catch (error) {
            console.error('Error loading print data:', error);
            setLogoLoaded(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!loading && quote && logoLoaded) {
            document.title = quote.lead_id 
                ? `Pre-Cotización - ${quote.client_name}` 
                : formatQuoteNumber(quote.quote_number, quote.created_at);
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [loading, quote, logoLoaded]);

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
                * { box-sizing: border-box; }
                body {
                    background-color: white;
                    margin: 0;
                    padding: 0;
                    color: #0F172A;
                    font-family: system-ui, -apple-system, sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    font-size: 8.5pt;
                    line-height: 1.3;
                }
                .print-container {
                    padding: 0;
                    max-width: 100%;
                    margin: 0;
                    position: static;
                }
                table { width: 100%; border-collapse: collapse; }
                thead { display: table-header-group; }
                tfoot { display: table-row-group; }
                tfoot.print-spacer-tfoot { display: none !important; }
                .print-footer { display: none !important; }
                tr { page-break-inside: avoid; }
                tr.item-row { border-bottom: 1px solid #E2E8F0; }
                th, td {
                    padding: 4px 6px;
                    font-size: 8.5pt;
                    line-height: 1.3;
                    text-align: left;
                }
                h1 { font-size: 14pt; margin: 0 0 4px 0; }
                h2, h3, h4 { font-size: 10pt; margin: 0 0 2px 0; }
                p, span, div { font-size: 8.5pt; }

                @page {
                    size: letter portrait;
                    margin: 1.5cm 1.5cm 2cm 1.5cm;
                    @bottom-left {
                        content: "${appSettings.provider_legal_name || 'Investments Cortés S.A.S.'}";
                        font-size: 7.5pt;
                        color: #94A3B8;
                        font-family: system-ui, -apple-system, sans-serif;
                        border-top: 1px solid #E2E8F0;
                        padding-top: 4px;
                    }
                    @bottom-right {
                        content: "Página " counter(page) " de " counter(pages);
                        font-size: 7.5pt;
                        color: #94A3B8;
                        font-family: system-ui, -apple-system, sans-serif;
                        border-top: 1px solid #E2E8F0;
                        padding-top: 4px;
                    }
                }
            ` }} />

            {/* Watermark in background */}
            <div style={{
                position: 'fixed',
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
                                {clientInfo.company_name && clientInfo.company_name.trim().toLowerCase() !== (quote.client_name || '').trim().toLowerCase() && (
                                    <div>{clientInfo.company_name}</div>
                                )}
                                {clientInfo.nit && <div>NIT: {clientInfo.nit}</div>}
                                {clientInfo.contact_name && <div>Atención: {clientInfo.contact_name}</div>}
                                {clientInfo.phone && <div>Teléfono: {clientInfo.phone}</div>}
                                {clientInfo.address && <div>Dirección: {clientInfo.address}</div>}
                            </div>
                        ) : lead ? (
                            <div style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                                {lead.company_name && lead.company_name.trim().toLowerCase() !== (quote.client_name || '').trim().toLowerCase() && (
                                    <div>{lead.company_name}</div>
                                )}
                                {lead.nit && <div>NIT: {lead.nit}</div>}
                                {lead.contact_name && <div>Atención: {lead.contact_name}</div>}
                                {lead.phone && <div>Teléfono: {lead.phone}</div>}
                                {lead.email && <div>Email: {lead.email}</div>}
                                {(lead.address || lead.municipality) && (
                                    <div>Dirección: {lead.address || ''}{lead.municipality ? ` - ${lead.municipality}` : ''}</div>
                                )}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.9rem', color: '#64748B', fontStyle: 'italic' }}>Consumidor Final</div>
                        )}
                    </div>
                     <div style={{ width: '50%', textAlign: 'right' }}>
                         <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                             {quote.lead_id ? 'Pre-Cotización B2B' : 'Cotización'}
                         </div>
                         <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.25rem' }}>
                             {quote.lead_id ? 'PROSPECTO' : formatQuoteNumber(quote.quote_number, quote.created_at)}
                         </div>
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
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '45%' }}>Producto</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '12%', textAlign: 'center' }}>Cant.</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%', textAlign: 'center' }}>IVA</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '13%', textAlign: 'right' }}>Valor Unitario</th>
                            <th style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '15%', textAlign: 'right' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...items].sort((a, b) => {
                            const skuA = (a.sku || a.products?.sku || a.product_name || a.products?.name || '').toString().toLowerCase();
                            const skuB = (b.sku || b.products?.sku || b.product_name || b.products?.name || '').toString().toLowerCase();
                            return skuA.localeCompare(skuB, 'es', { numeric: true, sensitivity: 'base' });
                        }).map((item, index) => {
                            return (
                                <tr key={item.id || index} className="item-row">
                                    <td style={{ fontSize: '1.1rem', fontWeight: '800', color: '#CBD5E1' }}>
                                        {String(index + 1).padStart(2, '0')}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.95rem' }}>{item.product_name || item.products?.name}</div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: '700', color: '#0F172A' }}>
                                        {item.quantity} {item.products?.unit_of_measure || 'Kg'}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: '700', color: '#0F172A' }}>
                                        {item.iva_rate || 0}%
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#0F172A' }}>
                                        ${formatPrice(Math.ceil(item.unit_price))}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '800', color: '#0F172A' }}>
                                        ${formatPrice(Math.ceil(item.total_price))}
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
                                ${formatPrice(Math.ceil(quote.subtotal_amount))}
                            </td>
                        </tr>
                        <tr style={{ color: '#64748B' }}>
                            <td colSpan={4}></td>
                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.85rem' }}>Impuestos (IVA)</td>
                            <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', fontWeight: '600', fontSize: '0.95rem' }}>
                                ${formatPrice(Math.ceil(quote.total_tax_amount))}
                            </td>
                        </tr>
                        <tr style={{ backgroundColor: '#F8FAFC', color: '#0F172A', borderTop: '1px solid #E2E8F0' }}>
                            <td colSpan={4}></td>
                            <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: '900', fontSize: '1rem' }}>Total General</td>
                            <td style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: '900', fontSize: '1.4rem', color: appSettings.primary_color || '#15803D' }}>
                                ${formatPrice(Math.ceil(quote.total_amount))}
                            </td>
                        </tr>
                    </tfoot>
                </table>
                
                {quote.lead_id && (
                    <div style={{
                        marginTop: '2rem',
                        padding: '1.25rem',
                        backgroundColor: '#F0FDF4',
                        borderLeft: `4px solid ${appSettings.primary_color || '#15803D'}`,
                        borderRadius: '6px',
                        textAlign: 'center',
                        pageBreakInside: 'avoid'
                    }}>
                        <div style={{ fontWeight: '800', fontSize: '1rem', color: '#166534', marginBottom: '0.4rem' }}>
                            💡 ¿Quieres recibir una oferta personalizada?
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#15803D', lineHeight: '1.4' }}>
                            Esta es una pre-cotización estimada con precios estándar de tu categoría. 
                            <strong> Ponte en contacto con nosotros al WhatsApp </strong> para formalizar tu cuenta y negociar tarifas especiales según tu consumo real.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
