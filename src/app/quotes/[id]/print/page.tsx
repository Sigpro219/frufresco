'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';

export default function PublicPrintQuotePage() {
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
                <div>Generando pre-cotización en PDF...</div>
            </div>
        );
    }

    if (!quote) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#EF4444' }}>
                Error: No se pudo cargar la cotización solicitada.
            </div>
        );
    }

    return (
        <div className="print-container">
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
                tr { page-break-inside: avoid; }
                tr.item-row { border-bottom: 1px solid #E2E8F0; }
                th, td {
                    padding: 6px 8px;
                    font-size: 8.5pt;
                    line-height: 1.3;
                    text-align: left;
                }
                h1 { font-size: 14pt; margin: 0 0 4px 0; }
                h2, h3, h4 { font-size: 10pt; margin: 0 0 2px 0; }
                p, span, div { font-size: 8.5pt; }

                @media print {
                    .no-print { display: none !important; }
                }
            ` }} />

            {/* Action Header for Screen */}
            <div className="no-print" style={{ backgroundColor: '#064E3B', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <div style={{ fontWeight: '800', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📄 Pre-Cotización Oficial FruFresco</span>
                </div>
                <button
                    onClick={() => window.print()}
                    style={{
                        backgroundColor: '#10B981',
                        color: 'white',
                        border: 'none',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '99px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    🖨️ Guardar o Imprimir PDF
                </button>
            </div>

            <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #059669', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#065F46', margin: 0 }}>{appSettings.app_name || 'FruFresco'}</h2>
                        <p style={{ margin: '2px 0 0 0', color: '#047857', fontWeight: '600', fontSize: '0.85rem' }}>Proveedor Institucional HORECA</p>
                        <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '0.78rem' }}>{appSettings.provider_legal_name} - NIT: {appSettings.provider_nit}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#065F46' }}>
                            PRE-COTIZACIÓN
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px' }}>
                            Fecha: {new Date(quote.created_at).toLocaleDateString('es-CO')}
                        </div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>DATOS DE LA OPERACIÓN REQUERIDA:</div>
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}><strong>Cliente / Empresa:</strong> {quote.client_name || lead?.company_name || 'Cliente B2B'}</div>
                    {lead?.phone && <div style={{ fontSize: '0.82rem', color: '#475569' }}><strong>Contacto / WhatsApp:</strong> {lead.phone}</div>}
                    {lead?.address && <div style={{ fontSize: '0.82rem', color: '#475569' }}><strong>Ubicación Despacho:</strong> {lead.address}</div>}
                </div>

                <table style={{ marginBottom: '1.5rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#065F46', color: 'white' }}>
                            <th style={{ padding: '8px' }}>Producto</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Empaque / Unidad</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Cantidad</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Precio Estimado</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => (
                            <tr key={idx} className="item-row">
                                <td style={{ padding: '8px', fontWeight: '600' }}>{item.product_name || item.products?.name || 'Producto'}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{item.products?.unit_of_measure || 'Kg'}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{item.quantity}</td>
                                <td style={{ padding: '8px', textAlign: 'right' }}>${formatPrice(item.unit_price)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>${formatPrice(item.total_price || (item.quantity * item.unit_price))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <div style={{ width: '250px', backgroundColor: '#ECFDF5', padding: '1rem', borderRadius: '12px', border: '1.5px solid #A7F3D0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                            <span>Subtotal:</span>
                            <span>${formatPrice(quote.subtotal_amount || quote.total_amount)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '1.05rem', color: '#065F46', borderTop: '1px solid #A7F3D0', paddingTop: '6px', marginTop: '6px' }}>
                            <span>TOTAL ESTIMADO:</span>
                            <span>${formatPrice(quote.total_amount)} COP</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
