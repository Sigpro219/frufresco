'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { FileText, Printer } from 'lucide-react';

const formatCategoryTitle = (cat?: string) => {
    if (!cat) return 'Otros Productos';
    const c = cat.toUpperCase().trim();
    if (c === 'FR' || c.startsWith('FRUT')) return 'Frutas';
    if (c === 'VE' || c.startsWith('VERD')) return 'Verduras';
    if (c === 'HO' || c.startsWith('HORT')) return 'Hortalizas';
    if (c === 'TU' || c.startsWith('TUBER') || c.startsWith('TUBÉR')) return 'Tubérculos y Plátanos';
    if (c === 'DE' || c.startsWith('DESP') || c.startsWith('ABARR')) return 'Despensa y Abarrotes';
    if (c === 'LA' || c.startsWith('LACT') || c.startsWith('LÁCT')) return 'Lácteos y Derivados';
    if (c === 'CO' || c.startsWith('CONG') || c.startsWith('PULP')) return 'Congelados y Pulpas';
    if (c === 'PR' || c.startsWith('PROC') || c.startsWith('PELAD')) return 'Procesados y Pelados';
    if (c === 'HI' || c.startsWith('HIER')) return 'Hierbas Aromáticas';
    return cat;
};

// 1. Frutas, 2. Verduras, 3. Hortalizas, luego las demás
const CATEGORY_PRIORITY = [
    'Frutas',
    'Verduras',
    'Hortalizas',
    'Tubérculos y Plátanos',
    'Despensa y Abarrotes',
    'Lácteos y Derivados',
    'Congelados y Pulpas',
    'Procesados y Pelados',
    'Hierbas Aromáticas',
    'Otros Productos'
];

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

    const formatMinQty = (item: any) => {
        const uom = (item.products?.unit_of_measure || item.unit || 'Kg').trim();
        const webFactor = item.products?.web_conversion_factor;
        const webUnit = item.products?.web_unit;

        if (uom.toLowerCase() === 'kg') {
            if (webFactor && webFactor > 0 && webFactor < 1) {
                return `${String(webFactor).replace('.', ',')} Kg`;
            }
            if (webFactor && webFactor > 1) {
                return `${String(webFactor).replace('.', ',')} Kg`;
            }
            return '1 Kg';
        }

        return `1 ${uom}`;
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

    const preloadLogo = (settings?: any) => {
        const logoUrl = settings?.provider_logo_url || settings?.app_logo_url || '/logo-investments.png';
        if (logoUrl) {
            const img = new Image();
            img.onload = () => setLogoLoaded(true);
            img.onerror = () => setLogoLoaded(true);
            img.src = logoUrl;
        } else {
            setLogoLoaded(true);
        }
    };

    const loadAllData = async () => {
        setLoading(true);
        const quoteId = params.id as string;
        try {
            // Attempt 1: Fetch via server API route
            let loaded = false;
            try {
                const res = await fetch(`/api/quotes/${quoteId}/public`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.quote) {
                        if (data.appSettings) {
                            setAppSettings(prev => ({ ...prev, ...data.appSettings }));
                        }
                        if (data.quote) setQuote(data.quote);
                        if (data.lead) setLead(data.lead);
                        if (data.clientInfo) setClientInfo(data.clientInfo);
                        if (data.items) setItems(data.items);
                        preloadLogo(data.appSettings);
                        loaded = true;
                    }
                }
            } catch (apiErr) {
                console.warn('API route failed, trying Supabase direct client...', apiErr);
            }

            // Attempt 2: Direct Supabase client query fallback
            if (!loaded) {
                const { data: qData, error: qErr } = await supabase
                    .from('quotes')
                    .select('*')
                    .eq('id', quoteId)
                    .maybeSingle();

                if (qErr || !qData) {
                    throw new Error(qErr?.message || 'No se pudo cargar la cotización');
                }

                setQuote(qData);

                if (qData.lead_id) {
                    const { data: lData } = await supabase
                        .from('leads')
                        .select('*')
                        .eq('id', qData.lead_id)
                        .maybeSingle();
                    if (lData) setLead(lData);
                }

                if (qData.client_id) {
                    const { data: cData } = await supabase
                        .from('profiles')
                        .select('company_name, contact_name, nit, phone, address')
                        .eq('id', qData.client_id)
                        .maybeSingle();
                    if (cData) setClientInfo(cData);
                }

                const { data: itemsData } = await supabase
                    .from('quote_items')
                    .select('*, products(name, unit_of_measure, sku, category, web_conversion_factor, web_unit)')
                    .eq('quote_id', quoteId);
                if (itemsData) setItems(itemsData);

                const { data: sData } = await supabase.from('app_settings').select('*');
                if (sData) {
                    const sMap: Record<string, string> = {};
                    sData.forEach((s: any) => { sMap[s.key] = s.value; });
                    setAppSettings(prev => ({ ...prev, ...sMap }));
                    preloadLogo(sMap);
                }
            }
        } catch (error) {
            console.error('Error loading print data:', error);
            preloadLogo();
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

    // Grouping & Strict Hierarchical + Alphabetical Sorting
    const groupedCategories = useMemo(() => {
        const catMap = new Map<string, any[]>();

        items.forEach(item => {
            const rawCat = item.products?.category || item.category || 'Otros Productos';
            const catTitle = formatCategoryTitle(rawCat);
            if (!catMap.has(catTitle)) {
                catMap.set(catTitle, []);
            }
            catMap.get(catTitle)!.push(item);
        });

        const groups: { category: string; items: any[] }[] = [];

        catMap.forEach((groupItems, category) => {
            // Orden alfabético estricto dentro de cada categoría
            groupItems.sort((a, b) => {
                const nameA = (a.product_name || a.products?.name || '').toString().toLowerCase();
                const nameB = (b.product_name || b.products?.name || '').toString().toLowerCase();
                return nameA.localeCompare(nameB, 'es', { numeric: true, sensitivity: 'base' });
            });
            groups.push({ category, items: groupItems });
        });

        // Orden estricto de categorías: 1. Frutas, 2. Verduras, 3. Hortalizas, etc.
        groups.sort((a, b) => {
            const idxA = CATEGORY_PRIORITY.indexOf(a.category);
            const idxB = CATEGORY_PRIORITY.indexOf(b.category);
            const prioA = idxA !== -1 ? idxA : 999;
            const prioB = idxB !== -1 ? idxB : 999;
            if (prioA !== prioB) return prioA - prioB;
            return a.category.localeCompare(b.category, 'es');
        });

        return groups;
    }, [items]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#64748B' }}>
                <div>Generando pre-cotización comercial...</div>
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

    let globalCounter = 0;

    return (
        <div className="print-container">
            <style dangerouslySetInnerHTML={{ __html: `
                * { box-sizing: border-box; }
                body {
                    background-color: white;
                    margin: 0;
                    padding: 0;
                    color: #0F172A;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    font-size: 7.8pt;
                    line-height: 1.25;
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
                tr.item-row { border-bottom: 1px solid #F1F5F9; }
                tr.item-row:nth-child(even) { background-color: #FAFAFA; }
                th, td {
                    padding: 3.5px 5px;
                    font-size: 7.8pt;
                    line-height: 1.2;
                    text-align: left;
                }
                .num-cell {
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -0.01em;
                }
                h1 { font-size: 13pt; margin: 0 0 3px 0; }
                h2, h3, h4 { font-size: 9.5pt; margin: 0 0 2px 0; }
                p, span, div { font-size: 7.8pt; }

                @media print {
                    @page {
                        size: letter portrait;
                        margin: 1.1cm 1.3cm 1.3cm 1.3cm;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                    }
                    .no-print { display: none !important; }
                    .page-break-avoid { page-break-inside: avoid; }
                }
            ` }} />

            {/* Action Header for Screen */}
            <div className="no-print" style={{ backgroundColor: '#064E3B', color: 'white', padding: '0.65rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <div style={{ fontWeight: '800', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={17} color="#4ADE80" />
                    <span>Pre-Cotización Oficial FruFresco</span>
                </div>
                <button
                    onClick={() => window.print()}
                    style={{
                        backgroundColor: '#10B981',
                        color: 'white',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        borderRadius: '8px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <Printer size={14} />
                    <span>Guardar o Imprimir PDF</span>
                </button>
            </div>

            {/* Watermark in background */}
            <div style={{
                position: 'fixed',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-30deg)',
                width: '380px',
                height: '380px',
                backgroundImage: `url(${appSettings.provider_logo_url || appSettings.app_logo_url})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'contain',
                opacity: 0.025,
                pointerEvents: 'none',
                zIndex: 0
            }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '1.25rem 1.75rem', maxWidth: '850px', margin: '0 auto' }}>
                {/* Header: Logo + Provider Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                        {(appSettings.provider_logo_url || appSettings.app_logo_url) && (
                            <img src={appSettings.provider_logo_url || appSettings.app_logo_url} alt="Logo" style={{ maxHeight: '60px', objectFit: 'contain' }} />
                        )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '7.8pt', color: '#475569', lineHeight: '1.3' }}>
                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '9.5pt' }}>{appSettings.provider_legal_name || 'Investments Cortés S.A.S.'}</div>
                        <div>NIT: {appSettings.provider_nit || '901.393.217'}</div>
                        <div>{appSettings.provider_address || 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C.'}</div>
                        <div>{appSettings.provider_email || 'contacto@investmentscortes.com'}</div>
                    </div>
                </div>

                {/* Solid Accent Divider */}
                <div style={{ borderTop: `2.5px solid ${appSettings.primary_color || '#15803D'}`, margin: '0.6rem 0 1rem 0' }}></div>

                {/* Metadata Block: 2 Columns */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.1rem', backgroundColor: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <div style={{ width: '55%' }}>
                        <div style={{ fontSize: '7pt', color: '#64748B', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Propuesta para:</div>
                        <div style={{ fontSize: '11pt', fontWeight: '800', color: '#0F172A', marginBottom: '0.15rem' }}>{quote.client_name}</div>
                        {clientInfo ? (
                            <div style={{ fontSize: '7.8pt', color: '#475569', lineHeight: '1.35' }}>
                                {clientInfo.company_name && clientInfo.company_name.trim().toLowerCase() !== (quote.client_name || '').trim().toLowerCase() && (
                                    <div style={{ fontWeight: '600' }}>{clientInfo.company_name}</div>
                                )}
                                {clientInfo.nit && <div>NIT: {clientInfo.nit}</div>}
                                {clientInfo.contact_name && <div>Atención: {clientInfo.contact_name}</div>}
                                {clientInfo.phone && <div>Teléfono: {clientInfo.phone}</div>}
                                {clientInfo.address && <div>Dirección: {clientInfo.address}</div>}
                            </div>
                        ) : lead ? (
                            <div style={{ fontSize: '7.8pt', color: '#475569', lineHeight: '1.35' }}>
                                {lead.company_name && lead.company_name.trim().toLowerCase() !== (quote.client_name || '').trim().toLowerCase() && (
                                    <div style={{ fontWeight: '600' }}>{lead.company_name}</div>
                                )}
                                {lead.nit && <div>NIT: {lead.nit}</div>}
                                {lead.contact_name && <div>Atención: {lead.contact_name}</div>}
                                {lead.phone && <div>Teléfono: {lead.phone}</div>}
                                {lead.email && <div>Email: {lead.email}</div>}
                                {(lead.address || lead.municipality) && (
                                    <div>Dirección: {lead.address || ''}${lead.municipality ? ` - ${lead.municipality}` : ''}</div>
                                )}
                            </div>
                        ) : (
                            <div style={{ fontSize: '7.8pt', color: '#64748B', fontStyle: 'italic' }}>Consumidor Final</div>
                        )}
                    </div>
                    <div style={{ width: '40%', textAlign: 'right' }}>
                        <div style={{ fontSize: '7pt', color: '#64748B', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                            {quote.lead_id ? 'Propuesta Comercial' : 'Cotización'}
                        </div>
                        <div style={{ fontSize: '11pt', fontWeight: '800', color: appSettings.primary_color || '#15803D', marginBottom: '0.2rem' }}>
                            {quote.quote_number ? formatQuoteNumber(quote.quote_number, quote.created_at) : 'PRE-COTIZACIÓN HORECA'}
                        </div>
                        <div style={{ fontSize: '7.8pt', color: '#475569', lineHeight: '1.35' }}>
                            <div><strong>Fecha:</strong> {quote.start_date || new Date(quote.created_at).toISOString().split('T')[0]}</div>
                            <div><strong>Vigencia:</strong> 8 días calendario</div>
                        </div>
                    </div>
                </div>

                {/* Table with Compact Rows & Category Sections */}
                <table style={{ width: '100%', marginBottom: '1.2rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1.5px solid #CBD5E1', color: '#475569', backgroundColor: '#F1F5F9' }}>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '4%', textAlign: 'center' }}>#</th>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '38%' }}>Producto</th>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '10%', textAlign: 'center' }}>U.M.</th>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '15%', textAlign: 'center' }}>Cant. Mínima</th>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '8%', textAlign: 'center' }}>IVA</th>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '12%', textAlign: 'right' }}>Tarifa Unitaria</th>
                            <th style={{ fontSize: '7pt', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', width: '13%', textAlign: 'right' }}>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedCategories.map((group) => {
                            return (
                                <React.Fragment key={group.category}>
                                    {/* Category Subheader Banner */}
                                    <tr style={{ backgroundColor: '#F8FAFC', pageBreakInside: 'avoid' }}>
                                        <td colSpan={7} style={{ 
                                            padding: '4px 6px', 
                                            borderLeft: `3px solid ${appSettings.primary_color || '#15803D'}`,
                                            borderTop: '1px solid #E2E8F0',
                                            borderBottom: '1px solid #E2E8F0'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: '800', fontSize: '7.5pt', color: '#0F172A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                    {group.category}
                                                </span>
                                                <span style={{ fontSize: '6.8pt', fontWeight: '700', color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 6px', borderRadius: '4px' }}>
                                                    {group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Products under this category (Alphabetically sorted) */}
                                    {group.items.map((item) => {
                                        globalCounter++;
                                        const unitPrice = Math.ceil(item.unit_price || 0);
                                        const totalPrice = Math.ceil(item.total_price || (unitPrice * (item.quantity || 1)));
                                        const unitLabel = item.products?.unit_of_measure || item.unit || 'Kg';
                                        const minQtyLabel = formatMinQty(item);

                                        return (
                                            <tr key={item.id || globalCounter} className="item-row">
                                                <td style={{ textAlign: 'center', fontSize: '7.2pt', fontWeight: '700', color: '#94A3B8' }}>
                                                    {String(globalCounter).padStart(2, '0')}
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: '600', color: '#1E293B', fontSize: '7.8pt' }}>
                                                        {item.product_name || item.products?.name}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: '500', color: '#475569', fontSize: '7.5pt' }}>
                                                    {unitLabel}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: '700', color: '#0D7A57', fontSize: '7.5pt', backgroundColor: '#F0FDF4', borderRadius: '4px' }}>
                                                    {minQtyLabel}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: '500', color: '#64748B', fontSize: '7.2pt' }}>
                                                    {item.iva_rate || 0}%
                                                </td>
                                                <td className="num-cell" style={{ textAlign: 'right', fontWeight: '600', color: '#0F172A', fontSize: '7.8pt' }}>
                                                    ${formatPrice(unitPrice)}
                                                </td>
                                                <td className="num-cell" style={{ textAlign: 'right', fontWeight: '700', color: '#0F172A', fontSize: '7.8pt' }}>
                                                    ${formatPrice(totalPrice)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ color: '#475569', borderTop: '1.5px solid #CBD5E1' }}>
                            <td colSpan={5}></td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: '600', fontSize: '7.8pt' }}>Subtotal</td>
                            <td className="num-cell" style={{ padding: '4px 6px', textAlign: 'right', fontWeight: '700', fontSize: '8.5pt', color: '#0F172A' }}>
                                ${formatPrice(Math.ceil(quote.subtotal_amount || quote.total_amount))}
                            </td>
                        </tr>
                        <tr style={{ color: '#64748B' }}>
                            <td colSpan={5}></td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: '500', fontSize: '7.5pt' }}>Impuestos (IVA)</td>
                            <td className="num-cell" style={{ padding: '3px 6px', textAlign: 'right', fontWeight: '600', fontSize: '8pt' }}>
                                ${formatPrice(Math.ceil(quote.total_tax_amount || 0))}
                            </td>
                        </tr>
                        <tr style={{ backgroundColor: '#F8FAFC', color: '#0F172A', borderTop: '1px solid #E2E8F0' }}>
                            <td colSpan={5}></td>
                            <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: '900', fontSize: '8.5pt' }}>Total General</td>
                            <td className="num-cell" style={{ padding: '6px 6px', textAlign: 'right', fontWeight: '900', fontSize: '10.5pt', color: appSettings.primary_color || '#15803D' }}>
                                ${formatPrice(Math.ceil(quote.total_amount))} COP
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* 💡 Callout: Oferta Personalizada */}
                <div className="page-break-avoid" style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#F0FDF4',
                    borderLeft: `3.5px solid ${appSettings.primary_color || '#15803D'}`,
                    borderRadius: '6px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontWeight: '800', fontSize: '8.2pt', color: '#166534', marginBottom: '0.2rem' }}>
                        💡 ¿Quieres recibir una oferta personalizada por volumen?
                    </div>
                    <div style={{ fontSize: '7.5pt', color: '#15803D', lineHeight: '1.3' }}>
                        Esta es una pre-cotización estimada con precios estándar de origen. 
                        <strong> Contáctanos por WhatsApp </strong> para formalizar tu cuenta y pactar acuerdos especiales según tu volumen real de compra.
                    </div>
                </div>

                {/* ⚠️ Legal Disclaimer */}
                <div className="page-break-avoid" style={{
                    marginTop: '0.65rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '6.8pt',
                    color: '#64748B',
                    lineHeight: '1.35'
                }}>
                    <strong style={{ color: '#475569' }}>Términos y Condiciones Legales:</strong> Esta pre-cotización tiene un propósito exclusivamente informativo y orientativo, por lo que <strong>no constituye una oferta comercial vinculante</strong> ni genera obligación contractual para FruFresco (Investments Cortés S.A.S.). Las tarifas presentadas tienen una <strong>vigencia de ocho (8) días calendario</strong> a partir de su fecha de emisión y están sujetas a variaciones de mercado o disponibilidad de cosecha.
                </div>
            </div>
        </div>
    );
}
