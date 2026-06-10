'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { ShoppingBag, TrendingUp, AlertCircle, CheckCircle2, Receipt, Calendar, FileText, ChevronRight, Download, CreditCard, RefreshCw } from 'lucide-react';

interface BillingCut {
    id: string;
    cut_number: number;
    scheduled_date: string;
    cut_slot: 'AM' | 'PM' | 'ADJ';
    status: 'open' | 'processing' | 'closed' | 'exported';
    total_orders: number;
    total_amount: number;
    created_at: string;
}

interface BillingReturn {
    id: string;
    order_id: string;
    product_id: string;
    quantity_returned: number;
    reason: string;
    photo_url: string;
    status: string;
    products: { name: string };
    orders: { sequence_id: number, created_at: string };
}

interface Invoice {
    id: string;
    invoice_number: string;
    order_id: string;
    cut_id: string;
    total_base: number;
    total_tax: number;
    total_final: number;
    status: 'pending' | 'printed' | 'exported' | 'cancelled';
    payment_status: 'pending' | 'paid' | 'overdue';
    due_date: string;
    created_at: string;
    orders: {
        sequence_id: number;
        created_at: string;
        profiles: {
            company_name: string;
            nit: string;
            payment_days: number;
        } | null;
    } | null;
}

export default function BillingDashboard() {
    const [cuts, setCuts] = useState<BillingCut[]>([]);
    const [returns, setReturns] = useState<BillingReturn[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'invoicing' | 'portfolio' | 'configuration'>('invoicing');
    const [subTab, setSubTab] = useState<'cuts' | 'returns'>('cuts');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch cuts
            const { data: cutsData, error: cutsError } = await supabase
                .from('billing_cuts')
                .select('*')
                .order('created_at', { ascending: false });
            if (cutsError) throw cutsError;
            setCuts(cutsData || []);

            // 2. Fetch returns
            const { data: returnsData, error: returnsError } = await supabase
                .from('billing_returns')
                .select(`
                    *,
                    products (name),
                    orders (sequence_id, created_at)
                `)
                .eq('status', 'pending_review');
            if (returnsError) throw returnsError;
            setReturns(returnsData || []);

            // 3. Fetch invoices with profile data
            const { data: invoicesData, error: invoicesError } = await supabase
                .from('billing_invoices')
                .select(`
                    *,
                    orders (
                        sequence_id,
                        created_at,
                        profiles (
                            company_name,
                            nit,
                            payment_days
                        )
                    )
                `)
                .order('created_at', { ascending: false });
            if (invoicesError) throw invoicesError;
            setInvoices(invoicesData || []);

            // 4. Fetch pending orders count
            const { count: ordersCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'delivered')
                .is('billing_cut_id', null);
            setPendingOrdersCount(ordersCount || 0);
        } catch (err: any) {
            console.error('Error fetching billing data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateCut = async (slot: 'AM' | 'PM') => {
        setIsProcessing(true);
        try {
            // Fetch eligible orders
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select(`
                    id, 
                    total, 
                    profile_id,
                    sequence_id,
                    created_at,
                    profiles (
                        payment_days,
                        iva_responsible
                    )
                `)
                .eq('status', 'delivered')
                .is('billing_cut_id', null);

            if (ordersError) throw ordersError;
            if (!orders || orders.length === 0) {
                alert('No hay pedidos listos para facturar en este momento.');
                return;
            }

            const totalAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);

            // 1. Create the cut
            const { data: newCut, error: cutError } = await supabase
                .from('billing_cuts')
                .insert([{
                    cut_slot: slot,
                    status: 'open',
                    total_orders: orders.length,
                    total_amount: totalAmount
                }])
                .select()
                .single();

            if (cutError) throw cutError;

            // 2. Link orders to the cut
            const orderIds = orders.map(o => o.id);
            const { error: linkError } = await supabase
                .from('orders')
                .update({ billing_cut_id: newCut.id })
                .in('id', orderIds);

            if (linkError) throw linkError;

            // 3. Generate sequential invoices for each order in the cut
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i];
                const cleanSeq = order.sequence_id.toString().padStart(4, '0');
                const invoiceNumber = `FE-${cleanSeq}-${Date.now().toString().slice(-4)}`;
                
                // Calculate tax base & IVA
                const total = order.total || 0;
                const isIva = order.profiles?.iva_responsible || false;
                const totalBase = isIva ? total / 1.19 : total;
                const totalTax = isIva ? total - totalBase : 0;

                // Calculate due date based on profile payment_days
                const creditDays = order.profiles?.payment_days || 0;
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + creditDays);

                await supabase.from('billing_invoices').insert([{
                    order_id: order.id,
                    cut_id: newCut.id,
                    invoice_number: invoiceNumber,
                    total_base: totalBase,
                    total_tax: totalTax,
                    total_final: total,
                    status: 'pending',
                    payment_status: 'pending',
                    due_date: dueDate.toISOString().split('T')[0]
                }]);
            }

            alert(`¡Corte ${slot} generado con éxito! ${orders.length} facturas emitidas.`);
            fetchData();
        } catch (err: any) {
            console.error('Error generating cut:', err);
            alert('Error al generar el corte: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessReturn = async (ret: BillingReturn, decision: 'approved' | 'rejected') => {
        setIsProcessing(true);
        try {
            if (decision === 'rejected') {
                const { error } = await supabase
                    .from('billing_returns')
                    .update({ status: 'rejected' })
                    .eq('id', ret.id);
                if (error) throw error;
            } else {
                // Get unit price
                const { data: itemData, error: itemError } = await supabase
                    .from('order_items')
                    .select('unit_price, quantity')
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id)
                    .single();
                if (itemError) throw itemError;

                const newQty = Math.max(0, Number(itemData.quantity) - Number(ret.quantity_returned));
                const priceCredit = Number(ret.quantity_returned) * Number(itemData.unit_price);

                // Subtract from items
                const { error: updateItemError } = await supabase
                    .from('order_items')
                    .update({ quantity: newQty })
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id);
                if (updateItemError) throw updateItemError;

                // Subtract from order total
                const { data: orderData } = await supabase.from('orders').select('total').eq('id', ret.order_id).single();
                const newTotal = Math.max(0, (Number(orderData?.total) || 0) - priceCredit);
                const { error: updateOrderError } = await supabase
                    .from('orders')
                    .update({ total: newTotal })
                    .eq('id', ret.order_id);
                if (updateOrderError) throw updateOrderError;

                // Recalculate billing_invoices details for this order
                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', ret.order_id).single();
                if (invoiceData) {
                    // Fetch if client is iva responsible to adjust bases
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles(iva_responsible)')
                        .eq('id', ret.order_id)
                        .single();
                    const isIva = (orderProf as any)?.profiles?.iva_responsible || false;
                    const totalBase = isIva ? newTotal / 1.19 : newTotal;
                    const totalTax = isIva ? newTotal - totalBase : 0;

                    await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: totalBase,
                            total_tax: totalTax,
                            total_final: newTotal
                        })
                        .eq('id', invoiceData.id);
                }

                // Update status of return
                await supabase.from('billing_returns').update({ status: 'approved' }).eq('id', ret.id);
            }
            alert(`✅ Novedad procesada: ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'}`);
            fetchData();
        } catch (err: any) {
            console.error('Error processing return:', err);
            alert('Error al procesar la devolución: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRegisterPayment = async () => {
        if (!selectedInvoice) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('billing_invoices')
                .update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_method: paymentMethod
                })
                .eq('id', selectedInvoice.id);

            if (error) throw error;
            alert('✅ Pago registrado exitosamente.');
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
            fetchData();
        } catch (err: any) {
            console.error('Error registering payment:', err);
            alert('Error al registrar el pago: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const exportToWorldOffice = async (cutId: string) => {
        try {
            const { data: items, error } = await supabase
                .from('order_items')
                .select(`
                    id, quantity, unit_price, nickname,
                    orders!inner(id, billing_cut_id, sequence_id, profiles(nit, company_name)),
                    products(sku, name)
                `)
                .eq('orders.billing_cut_id', cutId);

            if (error) throw error;
            if (!items || items.length === 0) {
                alert('No hay datos para exportar.');
                return;
            }

            const headers = ['Nit', 'Cliente', 'Referencia', 'Nombre', 'Cantidad', 'PrecioUnitario', 'Total'];
            const rows = items.map((item: any) => [
                item.orders.profiles?.nit || 'N/A',
                item.orders.profiles?.company_name || 'Invitado',
                item.products?.sku || 'Ref-00',
                item.nickname || item.products?.name || '',
                item.quantity,
                item.unit_price,
                (item.quantity * item.unit_price).toFixed(2)
            ]);

            const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Corte_WO_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            await supabase.from('billing_cuts').update({ status: 'exported', exported_at: new Date().toISOString() }).eq('id', cutId);
            fetchData();
        } catch (err) {
            console.error('Export error:', err);
            alert('Error al exportar.');
        }
    };

    // Ageing Receivable Totals
    const calculateAging = () => {
        let alDia = 0;
        let vencido1_15 = 0;
        let vencido16_30 = 0;
        let vencido30Mas = 0;
        const today = new Date();
        today.setHours(0,0,0,0);

        invoices.forEach(inv => {
            if (inv.payment_status === 'paid') return;
            const due = new Date(inv.due_date);
            due.setHours(0,0,0,0);
            
            const diffTime = today.getTime() - due.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                alDia += Number(inv.total_final || 0);
            } else if (diffDays <= 15) {
                vencido1_15 += Number(inv.total_final || 0);
            } else if (diffDays <= 30) {
                vencido16_30 += Number(inv.total_final || 0);
            } else {
                vencido30Mas += Number(inv.total_final || 0);
            }
        });

        return { alDia, vencido1_15, vencido16_30, vencido30Mas };
    };

    const aging = calculateAging();

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '2rem 1.5rem', fontFamily: THEME.typography.fontFamilyMain }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Receipt color={THEME.colors.primary} size={30} /> Facturación y Cartera
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', marginTop: '0.2rem' }}>
                            Gestión integral de cortes diarios, emisión de facturas y control de cartera de clientes.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                        <button
                            onClick={() => handleCreateCut('AM')}
                            disabled={isProcessing}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: THEME.radius.lg, fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', boxShadow: THEME.shadow.sm }}
                        >
                            ☀️ Generar Corte AM
                        </button>
                        <button
                            onClick={() => handleCreateCut('PM')}
                            disabled={isProcessing}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: THEME.colors.primaryHover, color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: THEME.radius.lg, fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', boxShadow: THEME.shadow.sm }}
                        >
                            🌙 Generar Corte PM
                        </button>
                    </div>
                </header>

                {/* Submodule Main Tabs */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: `1px solid ${THEME.colors.border}`, marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setActiveTab('invoicing')}
                        style={{ padding: '0.8rem 1rem', border: 'none', background: 'none', fontWeight: '750', fontSize: '0.95rem', cursor: 'pointer', borderBottom: activeTab === 'invoicing' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: activeTab === 'invoicing' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                    >
                        📝 Submódulo Facturación
                    </button>
                    <button
                        onClick={() => setActiveTab('portfolio')}
                        style={{ padding: '0.8rem 1rem', border: 'none', background: 'none', fontWeight: '750', fontSize: '0.95rem', cursor: 'pointer', borderBottom: activeTab === 'portfolio' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: activeTab === 'portfolio' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                    >
                        💰 Submódulo Cartera
                    </button>
                    <button
                        onClick={() => setActiveTab('configuration')}
                        style={{ padding: '0.8rem 1rem', border: 'none', background: 'none', fontWeight: '750', fontSize: '0.95rem', cursor: 'pointer', borderBottom: activeTab === 'configuration' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent', color: activeTab === 'configuration' ? THEME.colors.primary : THEME.colors.textSecondary, transition: 'all 0.15s' }}
                    >
                        ⚙️ Configuración
                    </button>
                </div>

                {/* INVOICING SUBMODULE */}
                {activeTab === 'invoicing' && (
                    <div>
                        {/* Sub-tabs cuts / returns */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button
                                onClick={() => setSubTab('cuts')}
                                style={{ backgroundColor: subTab === 'cuts' ? THEME.colors.primaryLight : 'transparent', color: subTab === 'cuts' ? THEME.colors.primary : THEME.colors.textSecondary, padding: '0.4rem 1rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                                Cortes Generales ({cuts.length})
                            </button>
                            <button
                                onClick={() => setSubTab('returns')}
                                style={{ backgroundColor: subTab === 'returns' ? THEME.colors.primaryLight : 'transparent', color: subTab === 'returns' ? THEME.colors.primary : THEME.colors.textSecondary, padding: '0.4rem 1rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                                Devoluciones Pendientes ({returns.length})
                            </button>
                        </div>

                        {subTab === 'cuts' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.md }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <th style={thStyle}># Corte</th>
                                                <th style={thStyle}>Fecha y Franja</th>
                                                <th style={thStyle}>Pedidos</th>
                                                <th style={thStyle}>Total Bruto</th>
                                                <th style={thStyle}>Estado</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loading ? (
                                                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Cargando cortes...</td></tr>
                                            ) : cuts.length === 0 ? (
                                                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay cortes generados aún.</td></tr>
                                            ) : cuts.map((cut) => {
                                                const openCut = cut.status === 'open';
                                                return (
                                                    <tr key={cut.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}>
                                                        <td style={tdStyle}><span style={{ fontWeight: '800' }}>{cut.cut_number.toString().padStart(4, '0')}</span></td>
                                                        <td style={tdStyle}>
                                                            <div style={{ fontWeight: '700' }}>{new Date(cut.scheduled_date).toLocaleDateString()}</div>
                                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Franja: {cut.cut_slot}</div>
                                                        </td>
                                                        <td style={tdStyle}>{cut.total_orders} pedidos</td>
                                                        <td style={{ ...tdStyle, fontWeight: '750' }}>{formatMoney(cut.total_amount)}</td>
                                                        <td style={tdStyle}>
                                                            <span style={{ backgroundColor: cut.status === 'exported' ? '#DCFCE7' : '#FEF3C7', color: cut.status === 'exported' ? '#166534' : '#92400E', padding: '0.2rem 0.6rem', borderRadius: THEME.radius.md, fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                {cut.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                            <button 
                                                                onClick={() => exportToWorldOffice(cut.id)}
                                                                style={{ backgroundColor: THEME.colors.background, color: THEME.colors.textMain, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', marginRight: '0.4rem' }}
                                                            >
                                                                <Download size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> WO CSV
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {subTab === 'returns' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '1.5rem', boxShadow: THEME.shadow.md }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
                                    {returns.length === 0 ? (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary }}>
                                            <CheckCircle2 color={THEME.colors.primary} size={40} style={{ marginBottom: '0.5rem' }} />
                                            <h3 style={{ fontWeight: '700', margin: 0 }}>No hay devoluciones pendientes</h3>
                                            <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Todas las novedades de transportadores al día.</p>
                                        </div>
                                    ) : returns.map((ret) => (
                                        <div key={ret.id} style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.lg, padding: '1rem', backgroundColor: 'white', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary }}>Pedido #{getFriendlyOrderId({ created_at: ret.orders.created_at, sequence_id: ret.orders.sequence_id })}</div>
                                                    <h4 style={{ margin: '0.1rem 0', fontWeight: '750', fontSize: '0.95rem' }}>{ret.products.name}</h4>
                                                </div>
                                                <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.1rem 0.4rem', borderRadius: THEME.radius.sm, fontSize: '0.7rem', fontWeight: '800' }}>
                                                    -{ret.quantity_returned} Uds
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: THEME.colors.textSecondary, fontStyle: 'italic' }}>
                                                &quot;{ret.reason || 'Sin observación'}&quot;
                                            </p>
                                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
                                                <button
                                                    onClick={() => handleProcessReturn(ret, 'rejected')}
                                                    style={{ flex: 1, padding: '0.4rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, background: 'white', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    onClick={() => handleProcessReturn(ret, 'approved')}
                                                    style={{ flex: 2, padding: '0.4rem', borderRadius: THEME.radius.md, border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                >
                                                    Aprobar Ajuste
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* PORTFOLIO SUBMODULE */}
                {activeTab === 'portfolio' && (
                    <div>
                        {/* Ageing Portfolio Widgets */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={kpiCardStyle}>
                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>SALDOS AL DÍA</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '850', color: THEME.colors.primary, marginTop: '0.4rem' }}>{formatMoney(aging.alDia)}</div>
                            </div>
                            <div style={kpiCardStyle}>
                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VENCIDO 1 - 15 DÍAS</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '850', color: '#D97706', marginTop: '0.4rem' }}>{formatMoney(aging.vencido1_15)}</div>
                            </div>
                            <div style={kpiCardStyle}>
                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VENCIDO 16 - 30 DÍAS</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '850', color: '#EA580C', marginTop: '0.4rem' }}>{formatMoney(aging.vencido16_30)}</div>
                            </div>
                            <div style={kpiCardStyle}>
                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VENCIDO +30 DÍAS</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: '850', color: '#DC2626', marginTop: '0.4rem' }}>{formatMoney(aging.vencido30Mas)}</div>
                            </div>
                        </div>

                        {/* Invoices Accounts Receivable list */}
                        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.md }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            <th style={thStyle}>Prefijo FE</th>
                                            <th style={thStyle}>Cliente</th>
                                            <th style={thStyle}>Vencimiento</th>
                                            <th style={thStyle}>Base Imponible</th>
                                            <th style={thStyle}>IVA</th>
                                            <th style={thStyle}>Total Neto</th>
                                            <th style={thStyle}>Estado Cartera</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.length === 0 ? (
                                            <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay facturas registradas en el sistema.</td></tr>
                                        ) : invoices.map((inv) => {
                                            const isOverdue = inv.payment_status === 'pending' && new Date(inv.due_date) < new Date();
                                            const statusLabel = inv.payment_status === 'paid' ? 'Pagada' : isOverdue ? 'Vencida' : 'Pendiente';
                                            const overdueDays = Math.ceil((new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));

                                            return (
                                                <tr key={inv.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}>
                                                    <td style={tdStyle}><span style={{ fontWeight: '800' }}>{inv.invoice_number}</span></td>
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: '700' }}>{inv.orders?.profiles?.company_name || 'Consumidor Final'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>NIT: {inv.orders?.profiles?.nit || 'N/A'}</div>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: '700' }}>{new Date(inv.due_date).toLocaleDateString()}</div>
                                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Plazo: {inv.orders?.profiles?.payment_days || 0} días</div>
                                                    </td>
                                                    <td style={tdStyle}>{formatMoney(inv.total_base)}</td>
                                                    <td style={tdStyle}>{formatMoney(inv.total_tax)}</td>
                                                    <td style={{ ...tdStyle, fontWeight: '750' }}>{formatMoney(inv.total_final)}</td>
                                                    <td style={tdStyle}>
                                                        <span style={{ 
                                                            backgroundColor: inv.payment_status === 'paid' ? '#DCFCE7' : isOverdue ? '#FEE2E2' : '#FEF3C7', 
                                                            color: inv.payment_status === 'paid' ? '#166534' : isOverdue ? '#991B1B' : '#92400E', 
                                                            padding: '0.2rem 0.6rem', 
                                                            borderRadius: THEME.radius.md, 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: '800' 
                                                        }}>
                                                            {statusLabel} {isOverdue && `(Hace ${overdueDays}d)`}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                        {inv.payment_status !== 'paid' && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedInvoice(inv);
                                                                    setIsPaymentModalOpen(true);
                                                                }}
                                                                style={{ backgroundColor: THEME.colors.primary, color: 'white', padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: 'none', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                                            >
                                                                <CreditCard size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Registrar Pago
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* CONFIGURATION */}
                {activeTab === 'configuration' && (
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '2rem', boxShadow: THEME.shadow.md, maxWidth: '800px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Configuración del Sistema
                        </h2>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={labelStyle}>Prefijo FE</label>
                                <input type="text" defaultValue="FE-BOG" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Número Inicial</label>
                                <input type="number" defaultValue="1001" style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.2rem' }}>
                            <button
                                onClick={() => alert('Configuración guardada exitosamente.')}
                                style={{ backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: THEME.radius.lg, fontWeight: '700', cursor: 'pointer' }}
                            >
                                Guardar Parámetros
                            </button>
                        </div>
                    </div>
                )}

                {/* MODAL REGISTRAR PAGO */}
                {isPaymentModalOpen && selectedInvoice && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', border: `1px solid ${THEME.colors.border}`, padding: '2rem', maxWidth: '450px', width: '100%', margin: 'auto', boxShadow: THEME.shadow.lg, position: 'relative' }}>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: '0 0 1rem 0' }}>Registrar Recaudo de Factura</h3>
                            
                            <div style={{ backgroundColor: THEME.colors.background, padding: '1rem', borderRadius: THEME.radius.lg, marginBottom: '1.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Factura</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '750' }}>{selectedInvoice.invoice_number}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Cliente</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>{selectedInvoice.orders?.profiles?.company_name || 'Final Client'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Total a Pagar</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: '850', color: THEME.colors.primary }}>{formatMoney(selectedInvoice.total_final)}</span>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={labelStyle}>Método de Pago</label>
                                <select 
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="Transferencia">Transferencia Bancaria (Bancolombia)</option>
                                    <option value="Efectivo">Efectivo (Entregado a Conductor)</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="Daviplata">Daviplata / Nequi</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => {
                                        setIsPaymentModalOpen(false);
                                        setSelectedInvoice(null);
                                    }}
                                    style={{ flex: 1, padding: '0.6rem', border: `1px solid ${THEME.colors.border}`, background: 'white', borderRadius: THEME.radius.md, fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRegisterPayment}
                                    disabled={isProcessing}
                                    style={{ flex: 2, padding: '0.6rem', border: 'none', background: THEME.colors.primary, color: 'white', borderRadius: THEME.radius.md, fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Confirmar Recaudo
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}

const kpiCardStyle: React.CSSProperties = {
    backgroundColor: THEME.colors.surface,
    border: `1px solid ${THEME.colors.border}`,
    borderRadius: '20px',
    padding: '1.2rem',
    boxShadow: THEME.shadow.sm,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
};

const thStyle: React.CSSProperties = {
    padding: '0.8rem 1rem',
    textAlign: 'left',
    fontSize: THEME.typography.tableHeader.fontSize,
    color: THEME.typography.tableHeader.color,
    fontWeight: THEME.typography.tableHeader.fontWeight,
    textTransform: THEME.typography.tableHeader.textTransform,
    letterSpacing: THEME.typography.tableHeader.letterSpacing
};

const tdStyle: React.CSSProperties = {
    padding: '1rem',
    fontSize: '0.85rem',
    color: THEME.colors.textMain
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginBottom: '0.4rem',
    textTransform: 'uppercase'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem',
    borderRadius: THEME.radius.md,
    border: `1px solid ${THEME.colors.border}`,
    fontSize: '0.85rem',
    backgroundColor: 'white'
};
