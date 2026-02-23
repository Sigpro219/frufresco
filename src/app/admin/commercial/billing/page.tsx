
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

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

interface Provider {
    id: string;
    name: string;
    location: string;
    contact_phone: string | null;
    contact_name: string | null;
    email: string | null;
    address: string | null;
    category: string;
    is_active: boolean;
    is_archived: boolean;
    tax_id: string | null;
    payment_terms_days: number | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_type: 'ahorros' | 'corriente' | null;
    notes: string | null;
    created_at?: string;
}

export default function BillingDashboard() {
    const [cuts, setCuts] = useState<BillingCut[]>([]);
    const [returns, setReturns] = useState<BillingReturn[]>([]);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'cuts' | 'returns' | 'providers' | 'archived' | 'configuration'>('cuts');
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDateEditable, setIsDateEditable] = useState(false);
    const [scrollY, setScrollY] = useState(0);
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Cuts
            const { data: cutsData, error: cutsError } = await supabase
                .from('billing_cuts')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (cutsError) throw cutsError;
            setCuts(cutsData || []);

            // 2. Fetch Pending Returns
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

            // 3. Fetch Providers
            const { data: providersData, error: providersError } = await supabase
                .from('providers')
                .select('*')
                .order('name', { ascending: true });
            
            if (providersError) throw providersError;
            setProviders(providersData || []);

            // 4. Fetch Pending Orders Count (Ready for billing)
            const { count: ordersCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'delivered')
                .is('billing_cut_id', null);
            
            setPendingOrdersCount(ordersCount || 0);

        } catch (err: any) {
            if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
            console.error('Detailed Billing Error:', err);
            // Si es un objeto de error de Supabase, tendrá estas propiedades
            if (err.message) console.log('Error Message:', err.message);
            if (err.code) console.log('Error Code:', err.code);
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
            // 1. Find dispatched orders that haven't been billed yet
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('id, total')
                .eq('status', 'delivered') // Or 'shipped' based on policy
                .is('billing_cut_id', null);

            if (ordersError) throw ordersError;

            if (!orders || orders.length === 0) {
                alert('No hay pedidos listos para facturar en este momento.');
                return;
            }

            const totalAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);

            // 2. Create the Cut
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

            // 3. Link orders to the cut (Blocking them)
            const orderIds = orders.map(o => o.id);
            const { error: linkError } = await supabase
                .from('orders')
                .update({ billing_cut_id: newCut.id })
                .in('id', orderIds);

            if (linkError) throw linkError;

            alert(`¡Corte ${slot} generado con éxito! ${orders.length} pedidos consolidados.`);
            fetchData();
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
            console.error('Error creating cut:', err);
            alert('Error al generar el corte: ' + (err.message || 'Error desconocido'));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessReturn = async (ret: BillingReturn, decision: 'approved' | 'rejected') => {
        setIsProcessing(true);
        try {
            if (decision === 'rejected') {
                const { error: rejectError } = await supabase
                    .from('billing_returns')
                    .update({ status: 'rejected' })
                    .eq('id', ret.id);
                if (rejectError) throw rejectError;
            } else {
                // 1. Get unit price from order_items for accurate credit calculation
                const { data: itemData, error: itemError } = await supabase
                    .from('order_items')
                    .select('unit_price, quantity')
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id)
                    .single();
                
                if (itemError) throw itemError;

                const newQty = Math.max(0, Number(itemData.quantity) - Number(ret.quantity_returned));
                const priceCredit = Number(ret.quantity_returned) * Number(itemData.unit_price);

                // 2. Update order_items (Subtract quantity)
                const { error: updateItemError } = await supabase.from('order_items')
                    .update({ quantity: newQty })
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id);
                if (updateItemError) throw updateItemError;

                // 3. Update orders total (Adjust invoice value)
                const { data: orderData } = await supabase.from('orders').select('total').eq('id', ret.order_id).single();
                const { error: updateOrderError } = await supabase.from('orders')
                    .update({ total: Math.max(0, (Number(orderData?.total) || 0) - priceCredit) })
                    .eq('id', ret.order_id);
                if (updateOrderError) throw updateOrderError;

                // 4. Mark return as approved
                const { error: approveError } = await supabase.from('billing_returns')
                    .update({ status: 'approved' })
                    .eq('id', ret.id);
                if (approveError) throw approveError;
            }
            alert(`✅ Novedad procesada: ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'}`);
            fetchData();
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
            console.error('Return processing error:', err);
            alert('Error al procesar la devolución: ' + (err.message || 'Error de base de datos'));
        } finally {
            setIsProcessing(false);
        }
    };

    const exportToWorldOffice = async (cutId: string) => {
        try {
            // Fetch order items for the cut
            const { data: items, error: itemsError } = await supabase
                .from('order_items')
                .select(`
                    id, quantity, unit_price,
                    orders!inner(id, billing_cut_id, sequence_id, profiles(nit, company_name)),
                    products(sku, name)
                `)
                .eq('orders.billing_cut_id', cutId);

            if (itemsError) throw itemsError;
            if (!items || items.length === 0) {
                alert('No hay datos para exportar.');
                return;
            }

            // Generate CSV (Flat File Structure for WO)
            const headers = ['Nit', 'Cliente', 'Referencia', 'Nombre', 'Cantidad', 'PrecioUnitario', 'Total'];
            const rows = items.map((item: any) => [
                item.orders.profiles?.nit || 'N/A',
                item.orders.profiles?.company_name || 'Invitado',
                item.products?.sku || 'Ref-00',
                item.products?.name || '',
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

            // Mark as exported
            await supabase.from('billing_cuts').update({ status: 'exported', exported_at: new Date().toISOString() }).eq('id', cutId);
            fetchData();
            
        } catch (err) {
            console.error('Export error:', err);
            alert('Error al exportar.');
        }
    };

    const handleSaveProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProvider) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('providers')
                .update({
                    name: selectedProvider.name,
                    tax_id: selectedProvider.tax_id,
                    contact_name: selectedProvider.contact_name,
                    contact_phone: selectedProvider.contact_phone,
                    email: selectedProvider.email,
                    address: selectedProvider.address,
                    location: selectedProvider.location,
                    category: selectedProvider.category,
                    is_active: selectedProvider.is_active,
                    is_archived: selectedProvider.is_archived,
                    payment_terms_days: selectedProvider.payment_terms_days,
                    bank_name: selectedProvider.bank_name,
                    bank_account_number: selectedProvider.bank_account_number,
                    bank_account_type: selectedProvider.bank_account_type,
                    notes: selectedProvider.notes,
                    created_at: selectedProvider.created_at
                })
                .eq('id', selectedProvider.id);

            if (error) throw error;
            setIsProcessing(false); // Liberar UI antes del alert
            setIsModalOpen(false);
            fetchData();
            alert('✅ Proveedor actualizado correctamente.');
        } catch (err: any) {
            setIsProcessing(false);
            console.error('Error updating provider:', err);
            alert('Error al actualizar: ' + (err.message || 'Error desconocido'));
        }
    };

    const handleArchiveProvider = async () => {
        if (!selectedProvider) return;
        if (!confirm(`¿Estás seguro de archivar a "${selectedProvider.name}"? Ya no aparecerá en la lista de facturación activa.`)) return;
        
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('providers')
                .update({ is_archived: true })
                .eq('id', selectedProvider.id);

            if (error) throw error;
            setIsProcessing(false);
            setIsModalOpen(false);
            fetchData();
            alert('📦 Proveedor archivado correctamente.');
        } catch (err: any) {
            setIsProcessing(false);
            console.error('Error archiving provider:', err);
            alert('Error al archivar: ' + (err.message || 'Error desconocido'));
        }
    };

    const handleUnarchiveProvider = async () => {
        if (!selectedProvider) return;
        
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('providers')
                .update({ is_archived: false })
                .eq('id', selectedProvider.id);

            if (error) throw error;
            setIsProcessing(false);
            setIsModalOpen(false);
            fetchData();
            alert('♻️ Proveedor restaurado correctamente.');
        } catch (err: any) {
            setIsProcessing(false);
            console.error('Error unarchiving provider:', err);
            alert('Error al restaurar: ' + (err.message || 'Error desconocido'));
        }
    };



    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'open': return { bg: '#FEF3C7', text: '#92400E', label: 'Abierto' };
            case 'closed': return { bg: '#DBEAFE', text: '#1E40AF', label: 'Cerrado' };
            case 'exported': return { bg: '#DCFCE7', text: '#166534', label: 'Exportado' };
            default: return { bg: '#F3F4F6', text: '#4B5563', label: status };
        }
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
            <Navbar />
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.025em' }}>
                            Módulo de Facturación
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '1.1rem', marginTop: '0.4rem' }}>
                            Gestión de cortes operativos, archivos planos WorldOffice y devoluciones.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={() => handleCreateCut('AM')}
                            disabled={isProcessing}
                            style={{ backgroundColor: '#111827', color: 'white', padding: '0.8rem 1.5rem', borderRadius: '14px', border: 'none', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            ☕ Generar Corte AM
                        </button>
                        <button 
                            onClick={() => handleCreateCut('PM')}
                            disabled={isProcessing}
                            style={{ backgroundColor: '#111827', color: 'white', padding: '0.8rem 1.5rem', borderRadius: '14px', border: 'none', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            🌗 Generar Corte PM
                        </button>
                    </div>
                </header>
 
                {/* DASHBOARD COLAPSIBLE */}
                <div style={{
                    position: 'sticky',
                    top: '1rem',
                    zIndex: 10,
                    marginBottom: '2rem',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>
                    <div style={{
                        backgroundColor: scrollY > 50 ? 'rgba(255, 255, 255, 0.95)' : 'white',
                        backdropFilter: scrollY > 50 ? 'blur(10px)' : 'none',
                        borderRadius: '24px',
                        padding: scrollY > 50 ? '0.75rem 1.5rem' : '1.5rem',
                        border: '1px solid #E2E8F0',
                        boxShadow: scrollY > 50 ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', gap: scrollY > 50 ? '2rem' : '3rem', transition: 'all 0.3s' }}>
                            <KPIItem 
                                label="Pedidos Listos" 
                                value={pendingOrdersCount} 
                                icon="📦" 
                                color="#2563EB" 
                                condensed={scrollY > 50} 
                            />
                            <KPIItem 
                                label="Cortes Abiertos" 
                                value={cuts.filter(c => c.status === 'open').length} 
                                icon="✂️" 
                                color="#D97706" 
                                condensed={scrollY > 50} 
                            />
                            <KPIItem 
                                label="Novedades" 
                                value={returns.length} 
                                icon="🚛" 
                                color="#DC2626" 
                                condensed={scrollY > 50} 
                            />
                            <KPIItem 
                                label="Prov. Incompletos" 
                                value={providers.filter(p => (!p.bank_name || !p.bank_account_number) && !p.is_archived).length} 
                                icon="⚠️" 
                                color="#9333EA" 
                                condensed={scrollY > 50} 
                            />
                        </div>

                        {!isProcessing && scrollY < 50 && (
                            <div style={{ textAlign: 'right', display: scrollY > 50 ? 'none' : 'block' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Facturación Hoy</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '950', color: '#0F172A' }}>
                                    ${cuts.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
                                        .reduce((acc, c) => acc + (c.total_amount || 0), 0).toLocaleString()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* TABS */}
                <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #E2E8F0', marginBottom: '2rem' }}>
                    {[
                        { id: 'cuts', label: '📦 Cortes Diarios' },
                        { id: 'returns', label: '🚛 Devoluciones' },
                        { id: 'providers', label: '🏢 Proveedores' },
                        { id: 'archived', label: '🗄️ Archivados' },
                        { id: 'configuration', label: '⚙️ Configuración' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{
                                padding: '1rem 0.5rem', border: 'none', background: 'none', cursor: 'pointer',
                                fontSize: '1rem', fontWeight: '700', color: activeTab === tab.id ? '#0F172A' : '#64748B',
                                borderBottom: activeTab === tab.id ? '3px solid #0F172A' : '3px solid transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                    {activeTab === 'cuts' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
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
                                    <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Cargando cortes...</td></tr>
                                ) : cuts.length === 0 ? (
                                    <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>No hay cortes generados aún.</td></tr>
                                ) : cuts.map((cut) => {
                                    const status = getStatusStyle(cut.status);
                                    return (
                                        <tr key={cut.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '900', color: '#0F172A' }}>{cut.cut_number.toString().padStart(4, '0')}</div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '700' }}>{new Date(cut.scheduled_date).toLocaleDateString()}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Franja: {cut.cut_slot}</div>
                                            </td>
                                            <td style={tdStyle}>{cut.total_orders} pedidos</td>
                                            <td style={{ ...tdStyle, fontWeight: '800', color: '#0F172A' }}>${cut.total_amount?.toLocaleString()}</td>
                                            <td style={tdStyle}>
                                                <span style={{ backgroundColor: status.bg, color: status.text, padding: '0.3rem 0.8rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                <button 
                                                    onClick={() => exportToWorldOffice(cut.id)}
                                                    style={{ backgroundColor: '#F1F5F9', color: '#0F172A', padding: '0.5rem 1rem', borderRadius: '10px', border: 'none', fontWeight: '800', cursor: 'pointer', marginRight: '0.5rem' }}
                                                >
                                                    📄 Exportar WO
                                                </button>
                                                <Link href={`/admin/commercial/billing/print/${cut.id}`} target="_blank">
                                                    <button style={{ backgroundColor: '#111827', color: 'white', padding: '0.5rem 1rem', borderRadius: '10px', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                                        🖨️ Documentos
                                                    </button>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'returns' && (
                        <div style={{ padding: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {returns.length === 0 ? (
                                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
                                        <h3 style={{ fontWeight: '900' }}>No hay devoluciones pendientes</h3>
                                        <p>Todas las remisiones coinciden con lo entregado.</p>
                                    </div>
                                ) : returns.map((ret) => (
                                    <div key={ret.id} style={{ border: '1px solid #E2E8F0', borderRadius: '20px', padding: '1.5rem', backgroundColor: 'white', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase' }}>Pedido #{getFriendlyOrderId({ created_at: ret.orders.created_at, sequence_id: ret.orders.sequence_id })}</div>
                                                <h3 style={{ margin: '0.2rem 0', fontWeight: '900', fontSize: '1.2rem' }}>{ret.products.name}</h3>
                                            </div>
                                            <div style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900' }}>
                                                -{ret.quantity_returned} Uds
                                            </div>
                                        </div>
                                        
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '1rem', flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Motivo del Conductor:</div>
                                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#1E293B' }}>&quot;{ret.reason || 'Sin observación'}&quot;</p>
                                        </div>

                                        {ret.photo_url && (
                                            <img src={ret.photo_url} alt="Remisión" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                                        )}

                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                            <button 
                                                onClick={() => handleProcessReturn(ret, 'rejected')}
                                                disabled={isProcessing}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: '1px solid #E2E8F0', background: 'white', fontWeight: '800', cursor: 'pointer' }}
                                            >
                                                Rechazar
                                            </button>
                                            <button 
                                                onClick={() => handleProcessReturn(ret, 'approved')}
                                                disabled={isProcessing}
                                                style={{ flex: 2, padding: '0.6rem', borderRadius: '10px', border: 'none', background: '#111827', color: 'white', fontWeight: '800', cursor: 'pointer' }}
                                            >
                                                Aprobar Descuento
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(activeTab === 'providers' || activeTab === 'archived') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div style={{ position: 'relative', width: '400px' }}>
                                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
                                    <input 
                                        type="text" 
                                        placeholder="Buscar por nombre, NIT, contacto o categoría..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.8rem 1rem 0.8rem 2.8rem', 
                                            borderRadius: '12px', 
                                            border: '1px solid #E2E8F0',
                                            fontSize: '0.95rem',
                                            outline: 'none',
                                            transition: 'border-color 0.2s'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#0F172A'}
                                        onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                    />
                                </div>
                            </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                    <th style={thStyle}>Proveedor / NIT</th>
                                    <th style={thStyle}>Contacto</th>
                                    <th style={thStyle}>Comunicación</th>
                                    <th style={thStyle}>Registro</th>
                                    <th style={thStyle}>Ubicación / Categoría</th>
                                    <th style={thStyle}>Estado</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Cargando proveedores...</td></tr>
                                ) : providers
                                    .filter(p => activeTab === 'providers' ? !p.is_archived : p.is_archived)
                                    .filter(p => {
                                        const search = searchTerm.toLowerCase();
                                        return p.name.toLowerCase().includes(search) || 
                                               (p.tax_id || '').toLowerCase().includes(search) ||
                                               (p.contact_name || '').toLowerCase().includes(search) ||
                                               (p.category || '').toLowerCase().includes(search);
                                    }).length === 0 ? (
                                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>No se encontraron proveedores.</td></tr>
                                ) : providers
                                    .filter(p => activeTab === 'providers' ? !p.is_archived : p.is_archived)
                                    .filter(p => {
                                        const search = searchTerm.toLowerCase();
                                        return p.name.toLowerCase().includes(search) || 
                                               (p.tax_id || '').toLowerCase().includes(search) ||
                                               (p.contact_name || '').toLowerCase().includes(search) ||
                                               (p.category || '').toLowerCase().includes(search);
                                    })
                                    .sort((a, b) => {
                                        const aIncomplete = (!a.bank_name || !a.bank_account_number) && !a.is_archived;
                                        const bIncomplete = (!b.bank_name || !b.bank_account_number) && !b.is_archived;
                                        if (aIncomplete && !bIncomplete) return -1;
                                        if (!aIncomplete && bIncomplete) return 1;
                                        return 0;
                                    })
                                    .map((p) => {
                                        const isIncomplete = !p.bank_name || !p.bank_account_number;
                                        return (
                                    <tr key={p.id} style={{ 
                                        borderBottom: '1px solid #F1F5F9', 
                                        transition: 'background 0.2s', 
                                        opacity: p.is_archived ? 0.7 : 1,
                                        backgroundColor: isIncomplete && !p.is_archived ? '#FFF7ED' : 'transparent'
                                    }}>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ fontWeight: '900', color: '#0F172A' }}>{p.name}</div>
                                                {isIncomplete && !p.is_archived && (
                                                    <span style={{ 
                                                        backgroundColor: '#F97316', 
                                                        color: 'white', 
                                                        fontSize: '0.6rem', 
                                                        padding: '0.1rem 0.4rem', 
                                                        borderRadius: '4px', 
                                                        fontWeight: '900' 
                                                    }}>
                                                        ⚠️ COMPLETAR
                                                    </span>
                                                )}
                                            </div>
                                            {p.tax_id && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>NIT: {p.tax_id}</div>}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: '700', color: '#334155' }}>{p.contact_name || 'Sin contacto'}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: '600' }}>{p.contact_phone || '---'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.email || ''}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '---'}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: '600' }}>{p.location || '---'}</div>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', backgroundColor: '#F1F5F9', padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: '800' }}>
                                                {p.category}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ 
                                                backgroundColor: p.is_active ? '#DCFCE7' : '#FEE2E2', 
                                                color: p.is_active ? '#166534' : '#991B1B', 
                                                padding: '0.3rem 0.8rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800' 
                                            }}>
                                                {p.is_active ? 'ACTIVO' : 'INACTIVO'}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                            <button 
                                                onClick={() => {
                                                    setSelectedProvider(p);
                                                    setIsDateEditable(false);
                                                    setIsModalOpen(true);
                                                }}
                                                style={{ backgroundColor: '#F1F5F9', color: '#0F172A', padding: '0.5rem 1rem', borderRadius: '10px', border: 'none', fontWeight: '800', cursor: 'pointer' }}
                                            >
                                                👁️ Detalles
                                            </button>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                        </div>
                    )}
                    
                    {activeTab === 'configuration' && (
                        <div style={{ padding: '2.5rem', maxWidth: '800px' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '900', marginBottom: '2rem' }}>Configuración del Sistema de Facturación</h2>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                {/* DOCUMENTACIÓN */}
                                <div style={configCard}>
                                    <h3 style={configTitle}>📄 Prefijos y Numeración</h3>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>Prefijo Factura Electrónica</label>
                                        <input type="text" defaultValue="FE-BOG" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Número Inicial</label>
                                        <input type="number" defaultValue="1001" style={inputStyle} />
                                    </div>
                                </div>

                                {/* IMPUESTOS */}
                                <div style={configCard}>
                                    <h3 style={configTitle}>⚖️ Impuestos y Tasas</h3>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>IVA General (%)</label>
                                        <input type="number" defaultValue="19" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Retención en la Fuente</label>
                                        <input type="number" defaultValue="2.5" style={inputStyle} />
                                    </div>
                                </div>

                                {/* CORTES OPERATIVOS */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <h3 style={configTitle}>⏰ Horarios de Corte Automático</h3>
                                    <div style={{ display: 'flex', gap: '2rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Hora Cierre Corte AM</label>
                                            <input type="time" defaultValue="12:00" style={inputStyle} />
                                            <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem' }}>Pedidos recibidos antes de esta hora entran en el primer bulto de facturación.</p>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Hora Cierre Corte PM</label>
                                            <input type="time" defaultValue="18:00" style={inputStyle} />
                                            <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem' }}>Pedidos finales del día para despacho nocturno o primera hora mañana.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* WORLD OFFICE */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <h3 style={configTitle}>🖥️ Exportación WorldOffice</h3>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Separador de Campos</label>
                                            <select style={inputStyle}>
                                                <option value=",">Coma (,)</option>
                                                <option value=";">Punto y Coma (;)</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Versión de Estructura</label>
                                            <select style={inputStyle}>
                                                <option value="2024">WO V15 (2024)</option>
                                                <option value="2023">WO V14 (Legacy)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button style={{ backgroundColor: '#111827', color: 'white', padding: '1rem 2rem', borderRadius: '14px', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                    💾 Guardar Configuración
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL EDICIÓN PROVEEDOR */}
            {isModalOpen && selectedProvider && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <div style={{ padding: '2rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '900', margin: 0 }}>Ficha del Proveedor</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}>✕</button>
                        </div>
                        
                        <form onSubmit={handleSaveProvider} style={{ padding: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                {/* Info Básica */}
                                <div style={configCard}>
                                    <h3 style={configTitle}>📋 Información Básica</h3>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>Razon Social / Nombre</label>
                                        <input type="text" value={selectedProvider.name} onChange={e => setSelectedProvider({...selectedProvider, name: e.target.value})} style={inputStyle} required />
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>NIT / Tax ID</label>
                                        <input type="text" value={selectedProvider.tax_id || ''} onChange={e => setSelectedProvider({...selectedProvider, tax_id: e.target.value})} style={inputStyle} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Categoría</label>
                                            <select 
                                                value={selectedProvider.category || ''} 
                                                onChange={e => setSelectedProvider({...selectedProvider, category: e.target.value})} 
                                                style={inputStyle}
                                            >
                                                <option value="" disabled>Seleccionar categoría...</option>
                                                <option value="Frutas">Frutas</option>
                                                <option value="Verduras">Verduras</option>
                                                <option value="Lácteos">Lácteos</option>
                                                <option value="Cárnicos">Cárnicos</option>
                                                <option value="Abarrotes">Abarrotes</option>
                                                <option value="Varios">Varios</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Estado</label>
                                            <select value={selectedProvider.is_active ? 'true' : 'false'} onChange={e => setSelectedProvider({...selectedProvider, is_active: e.target.value === 'true'})} style={inputStyle}>
                                                <option value="true">Activo</option>
                                                <option value="false">Inactivo</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Contacto */}
                                <div style={configCard}>
                                    <h3 style={configTitle}>📞 Contacto y Ubicación</h3>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>Nombre de Contacto</label>
                                        <input type="text" value={selectedProvider.contact_name || ''} onChange={e => setSelectedProvider({...selectedProvider, contact_name: e.target.value})} style={inputStyle} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Teléfono</label>
                                            <input type="text" value={selectedProvider.contact_phone || ''} onChange={e => setSelectedProvider({...selectedProvider, contact_phone: e.target.value})} style={inputStyle} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Email</label>
                                            <input type="email" value={selectedProvider.email || ''} onChange={e => setSelectedProvider({...selectedProvider, email: e.target.value})} style={inputStyle} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Ubicación (Bodega/Puesto)</label>
                                            <input type="text" value={selectedProvider.location || ''} onChange={e => setSelectedProvider({...selectedProvider, location: e.target.value})} style={inputStyle} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Dirección Física</label>
                                            <input type="text" value={selectedProvider.address || ''} onChange={e => setSelectedProvider({...selectedProvider, address: e.target.value})} style={inputStyle} />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <label style={labelStyle}>Fecha de Registro</label>
                                            {!isDateEditable && (
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirm('⚠️ ADVERTENCIA: Cambiar la fecha de registro puede afectar reportes históricos y auditorías. ¿Estás seguro que deseas habilitar la edición?')) {
                                                            if (confirm('🔒 CONFIRMACIÓN FINAL: Esta acción es sensible. ¿Confirmas que necesitas realizar este ajuste manual?')) {
                                                                setIsDateEditable(true);
                                                            }
                                                        }
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: '#6366F1', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                                                >
                                                    🔓 Desbloquear para edición manual
                                                </button>
                                            )}
                                        </div>
                                        <input 
                                            type="datetime-local" 
                                            value={selectedProvider.created_at ? new Date(selectedProvider.created_at).toISOString().slice(0, 16) : ''} 
                                            onChange={e => setSelectedProvider({...selectedProvider, created_at: e.target.value ? new Date(e.target.value).toISOString() : undefined})} 
                                            style={{ ...inputStyle, backgroundColor: isDateEditable ? 'white' : '#F1F5F9', cursor: isDateEditable ? 'text' : 'not-allowed' }} 
                                            readOnly={!isDateEditable}
                                        />
                                        <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginTop: '0.25rem' }}>
                                            {isDateEditable ? '⚠️ Estás editando una fecha sensible.' : 'Campo bloqueado para integridad de datos.'}
                                        </span>
                                    </div>
                                </div>

                                {/* Financiero */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <h3 style={configTitle}>💰 Información Financiera</h3>
                                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Banco</label>
                                            <input type="text" value={selectedProvider.bank_name || ''} onChange={e => setSelectedProvider({...selectedProvider, bank_name: e.target.value})} style={inputStyle} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Número de Cuenta</label>
                                            <input type="text" value={selectedProvider.bank_account_number || ''} onChange={e => setSelectedProvider({...selectedProvider, bank_account_number: e.target.value})} style={inputStyle} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Tipo Cuenta</label>
                                            <select 
                                                value={selectedProvider.bank_account_type || ''} 
                                                onChange={e => setSelectedProvider({...selectedProvider, bank_account_type: (e.target.value || null) as any})} 
                                                style={inputStyle}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="ahorros">Ahorros</option>
                                                <option value="corriente">Corriente</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Días de Crédito</label>
                                            <input 
                                                type="number" 
                                                value={selectedProvider.payment_terms_days || 0} 
                                                onChange={e => setSelectedProvider({...selectedProvider, payment_terms_days: parseInt(e.target.value) || 0})} 
                                                style={inputStyle} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Notas */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <label style={labelStyle}>Notas Internas</label>
                                    <textarea value={selectedProvider.notes || ''} onChange={e => setSelectedProvider({...selectedProvider, notes: e.target.value})} style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit' }} />
                                </div>
                            </div>

                            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {selectedProvider.is_archived ? (
                                    <button 
                                        type="button" 
                                        onClick={handleUnarchiveProvider}
                                        style={{ color: '#065F46', backgroundColor: '#D1FAE5', padding: '1rem 1.5rem', borderRadius: '14px', border: 'none', fontWeight: '800', cursor: 'pointer' }}
                                    >
                                        ♻️ Restaurar Proveedor
                                    </button>
                                ) : (
                                    <button 
                                        type="button" 
                                        onClick={handleArchiveProvider}
                                        style={{ color: '#991B1B', backgroundColor: '#FEE2E2', padding: '1rem 1.5rem', borderRadius: '14px', border: 'none', fontWeight: '800', cursor: 'pointer' }}
                                    >
                                        🗑️ Archivar Proveedor
                                    </button>
                                )}
                                
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '1rem 2rem', borderRadius: '14px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: '800', cursor: 'pointer' }}>
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={isProcessing} style={{ backgroundColor: '#111827', color: 'white', padding: '1rem 2.5rem', borderRadius: '14px', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                        {isProcessing ? 'Guardando...' : '💾 Guardar Cambios'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}

const configCard: React.CSSProperties = { padding: '1.5rem', border: '1px solid #E2E8F0', borderRadius: '20px', backgroundColor: '#F8FAFC' };
const configTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: '800', marginBottom: '1.5rem', color: '#0F172A' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '1rem', backgroundColor: 'white' };

const thStyle: React.CSSProperties = { padding: '1.2rem 1.5rem', textAlign: 'left', fontSize: '0.8rem', color: '#64748B', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '1.2rem 1.5rem', fontSize: '0.95rem', color: '#334155' };

function KPIItem({ label, value, icon, color, condensed }: { label: string, value: number, icon: string, color: string, condensed: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: condensed ? '0.5rem' : '1rem' }}>
            <div style={{ 
                fontSize: condensed ? '1.2rem' : '2rem', 
                backgroundColor: `${color}15`, 
                width: condensed ? '32px' : '56px', 
                height: condensed ? '32px' : '56px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                borderRadius: '16px',
                transition: 'all 0.3s'
            }}>
                {icon}
            </div>
            <div>
                {!condensed && <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>}
                <div style={{ 
                    fontSize: condensed ? '1rem' : '1.5rem', 
                    fontWeight: '950', 
                    color: '#0F172A',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                }}>
                    {value}
                    {condensed && <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B' }}>{label}</span>}
                </div>
            </div>
        </div>
    );
}
