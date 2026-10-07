'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { Printer, FileText, ShieldCheck } from 'lucide-react';
import Letterhead from '@/components/Letterhead';
import { printViaNewWindow } from '@/components/print';

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

const CATEGORY_PRIORITY = [
    'Verduras',
    'Frutas',
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
            maximumFractionDigits: 0
        }).format(value);
    };

    const formatQuoteNumber = (seq: number, status?: string, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq || 1).padStart(4, '0');
        const prefix = status === 'agreement' ? 'ACI' : 'COT';
        return `${prefix} ${day}${month} ${paddedSeq}`;
    };

    const formatMinQty = (item: any) => {
        const uom = (item.products?.unit_of_measure || item.unit || 'Kg').trim();
        const webFactor = item.products?.web_conversion_factor;

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
    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (params.id) {
            loadQuoteData();
        }
    }, [params.id]);

    const loadQuoteData = async () => {
        setLoading(true);
        try {
            const { data: qData, error: qErr } = await supabase
                .from('quotes')
                .select('*')
                .eq('id', params.id)
                .single();

            if (qErr) throw qErr;
            setQuote(qData);

            if (qData.lead_id) {
                const { data: lData } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('id', qData.lead_id)
                    .single();
                if (lData) setLead(lData);
            }

            if (qData.client_id) {
                const { data: cData } = await supabase
                    .from('profiles')
                    .select('company_name, razon_social, contact_name, nit, phone, contact_phone, email, address, payment_days')
                    .eq('id', qData.client_id)
                    .single();
                if (cData) setClientInfo(cData);
            }

            const { data: iData, error: iErr } = await supabase
                .from('quote_items')
                .select('*, products(name, unit_of_measure, sku, category, web_conversion_factor, web_unit, iva_rate)')
                .eq('quote_id', params.id);

            if (iErr) throw iErr;
            if (iData) setItems(iData);
        } catch (error) {
            console.error('Error cargando cotización pública:', error);
        } finally {
            setLoading(false);
        }
    };

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
            groupItems.sort((a, b) => {
                const nameA = (a.product_name || a.products?.name || '').toString().toLowerCase();
                const nameB = (b.product_name || b.products?.name || '').toString().toLowerCase();
                return nameA.localeCompare(nameB, 'es', { numeric: true, sensitivity: 'base' });
            });
            groups.push({ category, items: groupItems });
        });

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

    const handlePrint = () => {
        if (printDocRef.current) {
            printViaNewWindow({
                element: printDocRef.current,
                title: quote?.quote_number ? `Cotizacion_${quote.quote_number}` : 'Cotizacion_FruFresco',
                paperSize: 'letter',
                orientation: 'portrait',
                margin: '1.0cm 1.2cm'
            });
        } else {
            window.print();
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#64748B' }}>
                <div>Generando propuesta comercial en formato estandarizado...</div>
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

    const isAgreement = quote.status === 'agreement';
    const docNumber = formatQuoteNumber(quote.quote_number, quote.status, quote.created_at);
    const clientDisplayName = clientInfo?.razon_social || clientInfo?.company_name || quote.client_name || lead?.company_name || lead?.contact_name || 'Cliente Institucional';
    const clientNit = clientInfo?.nit || lead?.nit || 'N/A';
    const clientContact = clientInfo?.contact_name || lead?.contact_name || 'Comité de Compras';
    const clientPhone = clientInfo?.contact_phone || clientInfo?.phone || lead?.phone || 'Sin registrar';
    const clientEmail = clientInfo?.email || lead?.email || 'contacto@cliente.com';
    const clientAddress = clientInfo?.address || lead?.address || 'Bogotá D.C., Colombia';
    const paymentTerms = quote.payment_terms_days 
        ? `${quote.payment_terms_days} Días de Crédito` 
        : (clientInfo?.payment_days ? `${clientInfo.payment_days} Días de Crédito` : 'Contado contra entrega');
    const validityText = isAgreement && quote.valid_until
        ? `Vigente hasta ${new Date(quote.valid_until).toLocaleDateString('es-CO')}`
        : '8 Días Calendario (Sujeto a Cosecha)';

    let globalCounter = 0;

    return (
        <div style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', padding: '1rem 0' }}>
            <style>
                {`
                @media print {
                    @page {
                        size: letter portrait;
                        margin: 1.0cm 1.2cm;
                    }
                    .no-print { display: none !important; }
                    body { 
                        background: white !important; 
                        padding: 0 !important; 
                        margin: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
                `}
            </style>

            {/* BARRA SUPERIOR DE CONTROL */}
            <div className="no-print" style={{ 
                maxWidth: '850px', 
                margin: '0 auto 1rem', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                backgroundColor: '#FFFFFF', 
                padding: '0.75rem 1.25rem', 
                borderRadius: '10px', 
                border: '1px solid #CBD5E1', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)' 
            }}>
                <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileText size={16} color="#0D7A57" />
                        {isAgreement ? 'Acuerdo Comercial Institucional' : 'Cotización Comercial'} &bull; #{docNumber}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        Propuesta Comercial Oficial de FruFresco &bull; {items.length} productos ofertados
                    </div>
                </div>

                <button
                    onClick={handlePrint}
                    style={{
                        padding: '0.6rem 1.25rem',
                        backgroundColor: '#0D7A57',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '800',
                        fontSize: '0.82rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                    }}
                >
                    <Printer size={15} /> Imprimir / Descargar PDF
                </button>
            </div>

            {/* DOCUMENTO PRINCIPAL IMPRESO ENVOLTORIO UNIVERSAL LETTERHEAD */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0 auto' }}>
                <Letterhead
                    title={isAgreement ? 'ACUERDO COMERCIAL INSTITUCIONAL' : 'COTIZACIÓN COMERCIAL'}
                    subtitle="INVESTMENTS CORTES S.A.S. • Abastecimiento Agrícola & Dotación B2B"
                    date={quote.start_date || new Date(quote.created_at).toLocaleDateString('es-CO')}
                    reference={`#${docNumber}`}
                    badge={isAgreement ? 'ACUERDO VIGENTE' : (quote.lead_id ? 'PROSPECTO B2B' : 'PROPUESTA OFICIAL')}
                    badgeVariant={isAgreement ? 'emerald' : 'dark'}
                    paperSize="letter"
                    showWatermark={true}
                >
                    {/* MICRO-GRID DE INFORMACIÓN DEL CLIENTE */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.25fr 1fr',
                        gap: '8px',
                        backgroundColor: '#F8FAFC',
                        padding: '6px 10px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '5px',
                        fontSize: '7pt',
                        marginBottom: '8px'
                    }}>
                        <div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>CLIENTE / RAZÓN SOCIAL:</strong> {clientDisplayName}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>NIT / C.C.:</strong> {clientNit}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>DIRECCIÓN DE ENTREGA:</strong> {clientAddress}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>ATENCIÓN / CONTACTO:</strong> {clientContact} &bull; Tel: {clientPhone}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>CORREO FACTURACIÓN:</strong> {clientEmail}
                            </div>
                        </div>

                        <div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>DOCUMENTO:</strong> #{docNumber}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>FECHA EMISIÓN:</strong> {new Date(quote.created_at).toLocaleDateString('es-CO')}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>VIGENCIA:</strong> <span style={{ color: '#0D7A57', fontWeight: 800 }}>{validityText}</span>
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>PLAZO DE PAGO:</strong> {paymentTerms}
                            </div>
                            <div style={{ lineHeight: 1.3 }}>
                                <strong style={{ color: '#0F172A' }}>MODELO BASE:</strong> {quote.model_snapshot_name || 'Estándar Institucional'}
                            </div>
                        </div>
                    </div>

                    {/* TABLA DE PRODUCTOS EN FORMATO DE REMISIÓN INDUSTRIAL */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', color: '#475569' }}>
                                <th style={{ width: '4%', textAlign: 'center', fontSize: '7.5pt', padding: '3px 4px' }}>#</th>
                                <th style={{ width: '38%', fontSize: '7.5pt', padding: '3px 6px' }}>DESCRIPCIÓN DEL PRODUCTO</th>
                                <th style={{ width: '8%', textAlign: 'center', fontSize: '7.5pt', padding: '3px 4px' }}>UM</th>
                                <th style={{ width: '14%', textAlign: 'center', fontSize: '7.5pt', padding: '3px 4px' }}>CANT. MÍNIMA</th>
                                <th style={{ width: '8%', textAlign: 'center', fontSize: '7.5pt', padding: '3px 4px' }}>IVA</th>
                                <th style={{ width: '14%', textAlign: 'right', fontSize: '7.5pt', padding: '3px 6px' }}>PRECIO UNITARIO</th>
                                <th style={{ width: '14%', textAlign: 'right', fontSize: '7.5pt', padding: '3px 6px' }}>VALOR TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupedCategories.map((group) => (
                                <React.Fragment key={group.category}>
                                    <tr style={{ backgroundColor: '#F8FAFC', pageBreakInside: 'avoid' }}>
                                        <td colSpan={7} style={{ 
                                            padding: '3px 6px', 
                                            borderLeft: '3.5px solid #0D7A57',
                                            borderTop: '1px solid #E2E8F0',
                                            borderBottom: '1px solid #E2E8F0'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: 800, fontSize: '7.4pt', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    {group.category}
                                                </span>
                                                <span style={{ fontSize: '6.8pt', fontWeight: 700, color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 6px', borderRadius: '4px' }}>
                                                    {group.items.length} {group.items.length === 1 ? 'producto' : 'productos'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>

                                    {group.items.map((item) => {
                                        globalCounter++;
                                        const unitPrice = Math.ceil(item.unit_price || 0);
                                        const qty = item.quantity || 1;
                                        const totalPrice = Math.ceil(item.total_price || (unitPrice * qty));
                                        const unitLabel = item.products?.unit_of_measure || item.unit || 'Kg';
                                        const minQtyLabel = formatMinQty(item);
                                        const bg = globalCounter % 2 === 0 ? '#FAFAFA' : '#FFFFFF';

                                        return (
                                            <tr key={item.id || globalCounter} style={{ backgroundColor: bg, borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ textAlign: 'center', fontSize: '7.2pt', fontWeight: 700, color: '#94A3B8', padding: '3px 4px' }}>
                                                    {String(globalCounter).padStart(2, '0')}
                                                </td>
                                                <td style={{ padding: '3px 6px' }}>
                                                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '7.8pt', lineHeight: 1.2 }}>
                                                        {item.product_name || item.products?.name || 'Producto'}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '7.4pt', padding: '3px 4px' }}>
                                                    {unitLabel}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#0D7A57', fontSize: '7.4pt', backgroundColor: '#F0FDF4', padding: '3px 4px' }}>
                                                    {minQtyLabel}
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748B', fontSize: '7.2pt', padding: '3px 4px' }}>
                                                    {item.iva_rate || item.products?.iva_rate || 0}%
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#0F172A', fontSize: '7.8pt', fontVariantNumeric: 'tabular-nums', padding: '3px 6px' }}>
                                                    ${formatPrice(unitPrice)}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: '#0F172A', fontSize: '7.8pt', fontVariantNumeric: 'tabular-nums', padding: '3px 6px' }}>
                                                    ${formatPrice(totalPrice)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ color: '#475569', borderTop: '1.5px solid #CBD5E1' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, fontSize: '7.8pt' }}>Subtotal:</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 800, fontSize: '8.5pt', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                    ${formatPrice(Math.ceil(quote.subtotal_amount || quote.total_amount))}
                                </td>
                            </tr>
                            <tr style={{ color: '#64748B' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, fontSize: '7.5pt' }}>Impuestos (IVA):</td>
                                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 700, fontSize: '8pt', fontVariantNumeric: 'tabular-nums' }}>
                                    ${formatPrice(Math.ceil(quote.total_tax_amount || 0))}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#F8FAFC', color: '#0F172A', borderTop: '1px solid #CBD5E1' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontSize: '8.5pt' }}>Total General:</td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 900, fontSize: '10pt', color: '#0D7A57', fontVariantNumeric: 'tabular-nums' }}>
                                    ${formatPrice(Math.ceil(quote.total_amount))} COP
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* SELLO DE GARANTÍA */}
                    <div style={{
                        marginTop: '0.65rem',
                        marginBottom: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderLeft: '3.5px solid #0D7A57',
                        borderRadius: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '7.4pt', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <ShieldCheck size={13} color="#0D7A57" /> Sello de Garantía Operativa FruFresco B2B
                            </div>
                            <div style={{ fontSize: '6.8pt', color: '#475569', marginTop: '2px', lineHeight: 1.25 }}>
                                <strong>Cero Intermediarios:</strong> Abastecimiento directo de campo y Corabastos. 
                                <strong> Puntualidad Suiza:</strong> Despachos matutinos en ventana acordada antes de apertura de cocina. 
                                <strong> Cero Desperdicio:</strong> Selección y pesaje exacto con control de merma.
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px', borderLeft: '1px solid #CBD5E1' }}>
                            <div style={{ fontSize: '6.8pt', fontWeight: 800, color: '#0D7A57' }}>CALIDAD CERTIFICADA</div>
                            <div style={{ fontSize: '6.2pt', color: '#64748B' }}>Inocuidad & Trazabilidad</div>
                        </div>
                    </div>

                    {/* CLÁUSULA LEGAL */}
                    <div style={{
                        padding: '0.45rem 0.65rem',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '5px',
                        fontSize: '6.6pt',
                        color: '#64748B',
                        lineHeight: 1.3,
                        marginBottom: '0.75rem'
                    }}>
                        <strong style={{ color: '#475569' }}>Términos y Condiciones Legales:</strong> {isAgreement 
                            ? 'Este documento formaliza un Acuerdo Comercial de Precios Institucionales entre las partes. Las tarifas aquí contempladas se mantendrán vigentes durante el periodo estipulado salvo causas de fuerza mayor o catástrofes climáticas que alteren sustancialmente la disponibilidad de cosecha.'
                            : 'Esta propuesta comercial tiene un carácter orientativo y cotizador con vigencia de ocho (8) días calendario a partir de su emisión. Los precios finales quedarán perfeccionados y congelados una vez se suscriba el Acuerdo Comercial correspondiente o se emita la primera orden de compra.'
                        }
                    </div>

                    {/* BLOQUE DE FIRMAS */}
                    <div style={{ 
                        marginTop: '0.85rem', 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '24px', 
                        fontSize: '7pt', 
                        paddingTop: '8px', 
                        borderTop: '1px solid #CBD5E1',
                        pageBreakInside: 'avoid'
                    }}>
                        <div>
                            <div style={{ borderBottom: '1px solid #0F172A', height: '28px', marginBottom: '4px' }}></div>
                            <strong style={{ color: '#0F172A' }}>Investments Cortés S.A.S. (FruFresco)</strong>
                            <div style={{ color: '#64748B' }}>NIT: 901.393.217 &bull; Dirección Comercial</div>
                        </div>
                        <div>
                            <div style={{ borderBottom: '1px solid #0F172A', height: '28px', marginBottom: '4px' }}></div>
                            <strong style={{ color: '#0F172A' }}>Aceptación del Cliente / Razón Social</strong>
                            <div style={{ color: '#64748B' }}>Firma, Sello Comercial y C.C. / NIT</div>
                        </div>
                    </div>
                </Letterhead>
            </div>
        </div>
    );
}
