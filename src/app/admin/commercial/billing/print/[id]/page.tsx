'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Printer, 
    ArrowLeft, 
    AlertCircle, 
    Loader2, 
    Search, 
    FileText, 
    Building2, 
    Calendar, 
    DollarSign, 
    Layers,
    CheckCircle2,
    SlidersHorizontal
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId, resolvePhysicalInstruction } from '@/lib/orderUtils';
import Letterhead from '@/components/Letterhead';
import { printViaNewWindow } from '@/components/print';

interface BillingCut {
    id: string;
    cut_number: number;
    scheduled_date: string;
    cut_slot: string;
    status: string;
    total_orders: number;
    total_amount: number;
    notes?: string;
    created_at: string;
}

interface DianConfig {
    invoicePrefix: string;
    resolutionNumber: string;
    resolutionDate: string;
}

export default function BillingPrintPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [cut, setCut] = useState<BillingCut | null>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Interactive filter & options
    const [searchFilter, setSearchFilter] = useState('');
    const [forcePrices, setForcePrices] = useState(false);
    const [dianConfig, setDianConfig] = useState<DianConfig>({
        invoicePrefix: 'FV',
        resolutionNumber: '',
        resolutionDate: ''
    });

    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchPrintData = async () => {
            if (!id) return;
            setLoading(true);
            setErrorMessage(null);

            try {
                // 1. Fetch Cut Info
                const { data: cutData, error: cutErr } = await supabase
                    .from('billing_cuts')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (cutErr) throw cutErr;
                if (!cutData) {
                    setErrorMessage(`No se encontró ningún corte de facturación con el identificador "${id}".`);
                    setLoading(false);
                    return;
                }
                setCut(cutData);

                // 2. Fetch Orders and Items associated with this cut
                const { data: ordersData, error: ordersErr } = await supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, created_at, delivery_date, total, subtotal, document_type, remission_with_prices, payment_method, special_notes, admin_notes,
                        profiles:profile_id (
                            id, company_name, razon_social, contact_name, contact_phone, phone, address, document_type, remission_with_prices, nit, payment_days
                        ),
                        order_items (
                            id, quantity, unit_price, nickname, variant_label, selected_options,
                            products (id, name, sku, unit_of_measure)
                        )
                    `)
                    .eq('billing_cut_id', id)
                    .order('sequence_id', { ascending: true });

                if (ordersErr) throw ordersErr;
                setOrders(ordersData || []);

                // 3. Fetch DIAN resolution settings
                const { data: settingsData } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['billing_invoice_prefix', 'billing_resolution_number', 'billing_resolution_date']);

                if (settingsData && settingsData.length > 0) {
                    const settingsMap: Record<string, string> = {};
                    settingsData.forEach(s => { settingsMap[s.key] = s.value; });
                    setDianConfig({
                        invoicePrefix: settingsMap['billing_invoice_prefix'] || 'FV',
                        resolutionNumber: settingsMap['billing_resolution_number'] || '',
                        resolutionDate: settingsMap['billing_resolution_date'] || ''
                    });
                }
            } catch (err: any) {
                console.error('Error fetching billing print data:', err);
                setErrorMessage(err?.message || 'Error desconocido al cargar los documentos de facturación.');
            } finally {
                setLoading(false);
            }
        };

        fetchPrintData();
    }, [id]);

    // Filter orders based on user input
    const filteredOrders = useMemo(() => {
        if (!searchFilter.trim()) return orders;
        const q = searchFilter.toLowerCase().trim();
        return orders.filter(order => {
            const profile = order.profiles || {};
            const company = (profile.company_name || '').toLowerCase();
            const razon = (profile.razon_social || '').toLowerCase();
            const nit = (profile.nit || '').toLowerCase();
            const friendlyId = getFriendlyOrderId(order).toLowerCase();
            const contact = (profile.contact_name || '').toLowerCase();
            return company.includes(q) || razon.includes(q) || nit.includes(q) || friendlyId.includes(q) || contact.includes(q);
        });
    }, [orders, searchFilter]);

    const handlePrint = () => {
        if (printDocRef.current) {
            const printed = printViaNewWindow({
                element: printDocRef.current,
                title: `Corte_Facturacion_${cut?.cut_number ? String(cut.cut_number).padStart(4, '0') : id}`,
                paperSize: 'letter',
                orientation: 'portrait',
                margin: '0.8cm 1.0cm'
            });

            // Fallback in case browser blocks pop-ups
            if (!printed && typeof window !== 'undefined') {
                window.print();
            }
        } else if (typeof window !== 'undefined') {
            window.print();
        }
    };

    if (loading) {
        return (
            <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ backgroundColor: '#FFFFFF', padding: '2.5rem 3rem', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', textAlign: 'center', maxWidth: '420px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#ECFDF5', color: '#0D7A57', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                        <Loader2 size={24} className="animate-spin" />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', marginBottom: '0.35rem' }}>
                        Generando Documentos Oficiales
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                        Recuperando folios del corte #{id} y resoluciones DIAN de Investments Cortés S.A.S...
                    </p>
                </div>
            </div>
        );
    }

    if (errorMessage || !cut) {
        return (
            <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ backgroundColor: '#FFFFFF', padding: '2.5rem', borderRadius: '14px', border: '1px solid #FCA5A5', boxShadow: '0 4px 16px rgba(239,68,68,0.06)', textAlign: 'center', maxWidth: '480px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#FEF2F2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                        <AlertCircle size={26} />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', marginBottom: '0.4rem' }}>
                        Corte de Facturación No Encontrado
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: '#64748B', marginBottom: '1.5rem', lineHeight: 1.45 }}>
                        {errorMessage || `No fue posible cargar el corte con ID "${id}". Puede haber sido eliminado o no tener pedidos asignados.`}
                    </p>
                    <Link
                        href="/admin/commercial/billing"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            padding: '0.6rem 1.2rem',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            textDecoration: 'none',
                            boxShadow: '0 2px 6px rgba(13,122,87,0.25)'
                        }}
                    >
                        <ArrowLeft size={16} /> Volver a Mesa de Facturación
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="billing-print-wrapper" style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', padding: '1.5rem 1rem' }}>
            <style>
                {`
                @media print {
                    @page {
                        size: letter portrait;
                        margin: 0.8cm 1.0cm;
                    }
                    .no-print { display: none !important; }
                    .page-break { 
                        page-break-after: always !important; 
                        break-after: page !important; 
                    }
                    .page-break:last-child { 
                        page-break-after: avoid !important; 
                        break-after: avoid !important; 
                    }
                    body { 
                        background: white !important; 
                        padding: 0 !important; 
                        margin: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .billing-print-wrapper {
                        background: white !important;
                        min-height: auto !important;
                        padding: 0 !important;
                    }
                }
                `}
            </style>

            {/* BARRA DE HERRAMIENTAS Y CONTROL (NO IMPRIMIBLE) */}
            <header className="no-print" style={{ maxWidth: '900px', margin: '0 auto 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#FFFFFF', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link 
                            href="/admin/commercial/billing"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#475569',
                                textDecoration: 'none',
                                fontSize: '0.80rem',
                                fontWeight: 700,
                                padding: '0.45rem 0.75rem',
                                borderRadius: '7px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#F8FAFC',
                                transition: 'all 0.15s ease'
                            }}
                            title="Regresar a la Mesa de Facturación Masiva"
                        >
                            <ArrowLeft size={14} /> Facturación
                        </Link>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A', fontWeight: 900 }}>
                                    Corte #{cut.cut_number.toString().padStart(4, '0')}
                                </h2>
                                <span style={{ 
                                    backgroundColor: cut.cut_slot === 'AM' ? '#ECFDF5' : cut.cut_slot === 'PM' ? '#EFF6FF' : '#FEF3C7',
                                    color: cut.cut_slot === 'AM' ? '#065F46' : cut.cut_slot === 'PM' ? '#1E40AF' : '#92400E',
                                    border: `1px solid ${cut.cut_slot === 'AM' ? '#A7F3D0' : cut.cut_slot === 'PM' ? '#BFDBFE' : '#FDE68A'}`,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '6px',
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase'
                                }}>
                                    Franja {cut.cut_slot}
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                Fecha: {new Date(cut.scheduled_date).toLocaleDateString()} • {orders.length} documentos generados
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setForcePrices(!forcePrices)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.55rem 0.9rem',
                                borderRadius: '8px',
                                border: `1px solid ${forcePrices ? '#0D7A57' : '#CBD5E1'}`,
                                backgroundColor: forcePrices ? '#ECFDF5' : '#FFFFFF',
                                color: forcePrices ? '#065F46' : '#334155',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="Alternar visibilidad forzada de precios en remisiones a ciegas"
                        >
                            <SlidersHorizontal size={14} style={{ color: forcePrices ? '#0D7A57' : '#64748B' }} />
                            {forcePrices ? 'Precios: Forzados en Todo' : 'Precios: Según Perfil'}
                        </button>

                        <button 
                            type="button"
                            onClick={handlePrint} 
                            style={{ 
                                padding: '0.55rem 1.25rem', 
                                backgroundColor: '#0D7A57', 
                                color: '#FFFFFF', 
                                borderRadius: '8px', 
                                cursor: 'pointer', 
                                border: 'none', 
                                fontWeight: 800, 
                                fontSize: '0.82rem',
                                display: 'inline-flex', 
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 3px 10px rgba(13, 122, 87, 0.25)',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Printer size={16} /> Imprimir Lote ({filteredOrders.length})
                        </button>
                    </div>
                </div>

                {/* FILTRO RÁPIDO DE DOCUMENTOS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input
                            type="text"
                            placeholder="Filtrar pedidos de este corte por cliente, NIT o # de remisión..."
                            value={searchFilter}
                            onChange={e => setSearchFilter(e.target.value)}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '0.42rem 0.8rem 0.42rem 2rem',
                                fontSize: '0.78rem',
                                border: '1px solid #E2E8F0',
                                borderRadius: '7px',
                                outline: 'none',
                                color: '#0F172A',
                                backgroundColor: '#F8FAFC'
                            }}
                        />
                    </div>
                    {searchFilter && (
                        <button
                            type="button"
                            onClick={() => setSearchFilter('')}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#64748B',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                fontWeight: 700
                            }}
                        >
                            Limpiar
                        </button>
                    )}
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Mostrando {filteredOrders.length} de {orders.length}
                    </span>
                </div>
            </header>

            {/* ÁREA IMPRIMIBLE CON DOCUMENTOS OFICIALES */}
            <div ref={printDocRef}>
                {filteredOrders.length === 0 ? (
                    <div className="no-print" style={{ maxWidth: '850px', margin: '2rem auto', textAlign: 'center', padding: '3rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <FileText size={32} style={{ color: '#94A3B8', margin: '0 auto 0.75rem auto' }} />
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', margin: '0 0 0.35rem 0' }}>
                            No hay documentos que coincidan con la búsqueda
                        </h4>
                        <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0 }}>
                            Prueba con otro término de búsqueda o limpia el filtro superior.
                        </p>
                    </div>
                ) : (
                    filteredOrders.map((order) => {
                        const profile = order.profiles || {};
                        const docType = order.document_type || profile.document_type || 'invoice';
                        const isInvoice = docType === 'invoice';
                        
                        // Respetar política de precios o forzado global
                        const showPrices = forcePrices 
                            ? true 
                            : (isInvoice ? true : (order.remission_with_prices ?? profile.remission_with_prices ?? true));

                        const titleText = isInvoice ? 'FACTURA ELECTRÓNICA DE VENTA' : 'REMISIÓN OFICIAL DE ENTREGA';
                        const footerSender = isInvoice 
                            ? 'Investments Cortés S.A.S. • Facturación & Cartera' 
                            : 'Investments Cortés S.A.S. • Despachos & Logística';
                        
                        const deliveryDateFormatted = order.delivery_date 
                            ? new Date(order.delivery_date).toLocaleDateString()
                            : new Date(order.created_at).toLocaleDateString();

                        const subtotalOrder = order.subtotal || order.total || 0;

                        return (
                            <Letterhead 
                                key={order.id} 
                                title={titleText}
                                subtitle={`${profile.company_name || 'Cliente B2B'} • NIT: ${profile.nit || '222222222222'}`}
                                date={deliveryDateFormatted}
                                reference={`#${getFriendlyOrderId(order)}`}
                                badge={isInvoice ? 'DIAN VÁLIDA' : (showPrices ? 'VALORIZADA' : 'A CIEGAS')}
                                badgeVariant={isInvoice ? 'dark' : (showPrices ? 'emerald' : 'light')}
                                className="page-break"
                            >
                                <div style={{ padding: '0.25rem 0' }}>
                                    {/* INFO CLIENTE & DESTINO */}
                                    <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: '1.2fr 1fr', 
                                        gap: '10px', 
                                        marginBottom: '0.65rem', 
                                        padding: '7px 10px', 
                                        backgroundColor: '#F8FAFC', 
                                        borderRadius: '6px', 
                                        border: '1px solid #E2E8F0', 
                                        fontSize: '0.68rem',
                                        boxSizing: 'border-box'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '0.58rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
                                                Cliente / Razón Social
                                            </div>
                                            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.78rem', lineHeight: 1.25, marginTop: '1px' }}>
                                                {profile.company_name || profile.razon_social || 'Consumidor Final'}
                                            </div>
                                            <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.66rem', marginTop: '2px', fontFamily: 'monospace' }}>
                                                NIT / C.C.: {profile.nit || '222222222222'}
                                            </div>
                                            <div style={{ color: '#64748B', fontSize: '0.64rem', marginTop: '1px' }}>
                                                Contacto: {profile.contact_name || 'Atención en Sede'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.58rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
                                                Destino / Condiciones de Entrega
                                            </div>
                                            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.72rem', lineHeight: 1.25, marginTop: '1px' }}>
                                                {profile.address || 'Entrega en Bodega Central'}
                                            </div>
                                            <div style={{ color: '#475569', fontSize: '0.64rem', marginTop: '2px' }}>
                                                Teléfono: {profile.contact_phone || profile.phone || 'N/A'}
                                            </div>
                                            <div style={{ color: '#0D7A57', fontWeight: 700, fontSize: '0.64rem', marginTop: '1px' }}>
                                                Plazo: {profile.payment_days ? `${profile.payment_days} días de crédito` : order.payment_method || 'Contado'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* FRANJA DE RESOLUCIÓN DIAN (SOLO EN FACTURAS) */}
                                    {isInvoice && dianConfig.resolutionNumber && (
                                        <div style={{
                                            backgroundColor: '#F1F5F9',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            marginBottom: '0.55rem',
                                            fontSize: '0.58rem',
                                            color: '#334155',
                                            lineHeight: 1.3
                                        }}>
                                            <strong>Resolución DIAN No. {dianConfig.resolutionNumber}</strong> de fecha {dianConfig.resolutionDate || 'vigente'}. 
                                            Prefijo autorizado <strong>{dianConfig.invoicePrefix}</strong>. Modalidad Facturación Electrónica de Venta.
                                        </div>
                                    )}

                                    {/* TABLA DE PRODUCTOS Y ESPECIFICACIONES */}
                                    <table>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '6%', textAlign: 'center' }}>#</th>
                                                <th style={{ width: '14%' }}>REF / SKU</th>
                                                <th style={{ width: showPrices ? '40%' : '65%' }}>DESCRIPCIÓN DEL PRODUCTO</th>
                                                <th style={{ width: '14%' }} className="text-right">CANTIDAD</th>
                                                {showPrices && <th style={{ width: '13%' }} className="text-right">VALOR UNIT.</th>}
                                                {showPrices && <th style={{ width: '13%' }} className="text-right">TOTAL</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {order.order_items?.map((item: any, i: number) => {
                                                const physicalInst = resolvePhysicalInstruction({
                                                    quantity: item.quantity,
                                                    unit: item.products?.unit_of_measure,
                                                    variant_label: item.variant_label,
                                                    nickname: item.nickname,
                                                    selected_options: item.selected_options
                                                });
                                                const unitPrice = item.unit_price || 0;
                                                const lineTotal = item.quantity * unitPrice;

                                                return (
                                                    <tr key={item.id || i}>
                                                        <td style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.62rem' }}>
                                                            {i + 1}
                                                        </td>
                                                        <td style={{ fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                                                            {item.products?.sku || '---'}
                                                        </td>
                                                        <td>
                                                            <strong style={{ color: '#0F172A' }}>
                                                                {item.nickname || item.products?.name}
                                                            </strong>
                                                            {physicalInst && (
                                                                <div style={{ fontSize: '0.60rem', color: '#0D7A57', fontWeight: 700, marginTop: '1px' }}>
                                                                    ↳ {physicalInst}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="text-right" style={{ fontWeight: 800 }}>
                                                            {item.quantity}{' '}
                                                            <span style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>
                                                                {item.products?.unit_of_measure || 'Kg'}
                                                            </span>
                                                        </td>
                                                        {showPrices && (
                                                            <td className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                                ${unitPrice.toLocaleString('es-CO')}
                                                            </td>
                                                        )}
                                                        {showPrices && (
                                                            <td className="text-right" style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>
                                                                ${lineTotal.toLocaleString('es-CO')}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        {showPrices && (
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #0F172A' }}>
                                                    <td colSpan={4} className="text-right" style={{ fontWeight: 800, fontSize: '0.70rem', textTransform: 'uppercase' }}>
                                                        Subtotal Productos:
                                                    </td>
                                                    <td colSpan={2} className="text-right" style={{ fontWeight: 800, fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${subtotalOrder.toLocaleString('es-CO')}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td colSpan={4} className="text-right" style={{ fontWeight: 700, fontSize: '0.64rem', color: '#64748B' }}>
                                                        IVA (0% - Bienes Excluidos Art. 424 E.T.):
                                                    </td>
                                                    <td colSpan={2} className="text-right" style={{ fontWeight: 700, fontSize: '0.68rem', color: '#64748B' }}>
                                                        $0
                                                    </td>
                                                </tr>
                                                <tr style={{ borderTop: '1px solid #CBD5E1', backgroundColor: '#F8FAFC' }}>
                                                    <td colSpan={4} className="text-right" style={{ fontWeight: 900, fontSize: '0.76rem', color: '#0D7A57', textTransform: 'uppercase' }}>
                                                        TOTAL DOCUMENTO (COP):
                                                    </td>
                                                    <td colSpan={2} className="text-right" style={{ fontWeight: 900, color: '#0D7A57', fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${(order.total || subtotalOrder).toLocaleString('es-CO')}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>

                                    {/* OBSERVACIONES LOGÍSTICAS */}
                                    {(order.special_notes || order.admin_notes) && (
                                        <div style={{ 
                                            margin: '0.45rem 0', 
                                            padding: '4px 8px', 
                                            backgroundColor: '#FEF3C7', 
                                            border: '1px solid #FCD34D', 
                                            borderRadius: '4px', 
                                            fontSize: '0.62rem', 
                                            color: '#92400E' 
                                        }}>
                                            <strong>Nota Operativa:</strong> {order.special_notes || order.admin_notes}
                                        </div>
                                    )}

                                    {/* FIRMAS DE CONFORMIDAD Y ENTREGA */}
                                    <div style={{ 
                                        marginTop: '1.2rem', 
                                        paddingTop: '0.75rem', 
                                        borderTop: '1px solid #E2E8F0', 
                                        display: 'grid', 
                                        gridTemplateColumns: '1fr 1fr', 
                                        gap: '28px', 
                                        fontSize: '0.65rem' 
                                    }}>
                                        <div>
                                            <div style={{ borderBottom: '1px solid #0F172A', width: '210px', height: '20px' }}></div>
                                            <div style={{ marginTop: '4px', fontWeight: 800, color: '#0F172A' }}>{footerSender}</div>
                                            <div style={{ color: '#64748B', fontSize: '0.60rem' }}>Despachado y Verificado en Báscula • FruFresco</div>
                                        </div>
                                        <div>
                                            <div style={{ borderBottom: '1px solid #0F172A', width: '210px', height: '20px' }}></div>
                                            <div style={{ marginTop: '4px', fontWeight: 800, color: '#0F172A' }}>Recibido a Conformidad Cliente</div>
                                            <div style={{ color: '#64748B', fontSize: '0.60rem' }}>Firma, Cédula de Quien Recibe y Sello de la Empresa</div>
                                        </div>
                                    </div>
                                </div>
                            </Letterhead>
                        );
                    })
                )}
            </div>
        </div>
    );
}
