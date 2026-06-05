'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { 
    Package, 
    Scissors, 
    Truck, 
    AlertTriangle, 
    Building2, 
    Archive, 
    Settings, 
    Search, 
    FileText, 
    Printer, 
    Eye, 
    X, 
    Coffee, 
    Moon, 
    Clipboard, 
    Phone, 
    DollarSign, 
    Scale, 
    Clock, 
    Percent, 
    Download 
} from 'lucide-react';

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
            console.error('Detailed Billing Error:', {
                message: err.message,
                code: err.code,
                details: err.details,
                hint: err.hint,
                stack: err.stack
            });
            // Alerta visual discreta si es error de base de datos
            if (err.code === 'PGRST205') {
                console.warn('⚠️ La base de datos de facturación no está configurada. Ejecuta el esquema SQL.');
            }
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
                    id, quantity, unit_price, nickname,
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
        
        // Validaciones básicas
        if (!selectedProvider.name) {
            alert('El nombre o razón social es obligatorio');
            return;
        }

        setIsProcessing(true);
        try {
            const isNew = !selectedProvider.id || selectedProvider.id === 'NEW';
            
            // Preparar payload
            const { id: _id, ...payload } = selectedProvider;
            
            if (isNew) {
                const { error } = await supabase
                    .from('providers')
                    .insert([payload]);
                if (error) throw error;
                alert('✅ Proveedor creado correctamente.');
            } else {
                const { error } = await supabase
                    .from('providers')
                    .update(payload)
                    .eq('id', selectedProvider.id);
                if (error) throw error;
                alert('✅ Proveedor actualizado correctamente.');
            }
            
            setIsModalOpen(false);
            fetchData();
        } catch (err: any) {
            console.error('Error saving provider:', err);
            alert('Error al guardar: ' + (err.message || 'Error desconocido'));
        } finally {
            setIsProcessing(true);
            setIsProcessing(false);
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
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography.fontFamilySecondary }}>
            <style dangerouslySetInnerHTML={{ __html: `
                .billing-row {
                    border-bottom: 1px solid ${THEME.colors.border};
                    transition: background-color 0.2s ease;
                }
                .billing-row:hover {
                    background-color: #F8FAF9 !important;
                }
                .kpi-card {
                    border: 1px solid ${THEME.colors.border};
                    background-color: ${THEME.colors.surface};
                    border-radius: ${THEME.radius.lg};
                    padding: 1.25rem 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: default;
                    box-shadow: ${THEME.shadow.sm};
                }
                .kpi-card:hover {
                    transform: translateY(-1px);
                    box-shadow: ${THEME.shadow.lg};
                }
                .outline-btn {
                    border: 1px solid ${THEME.colors.borderActive};
                    background-color: transparent;
                    color: ${THEME.colors.textSecondary};
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 0.5rem 1rem;
                    border-radius: ${THEME.radius.md};
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s ease;
                }
                .outline-btn:hover {
                    border-color: ${THEME.colors.textSecondary};
                    color: ${THEME.colors.textMain};
                }
                .primary-btn {
                    background-color: ${THEME.colors.primary};
                    color: white;
                    padding: 0.8rem 1.5rem;
                    border-radius: ${THEME.radius.md};
                    border: none;
                    font-weight: 600;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: background-color 0.2s ease;
                }
                .primary-btn:hover {
                    background-color: ${THEME.colors.primaryHover};
                }
                .billing-tab-button {
                    padding: 8px 16px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: ${THEME.colors.textSecondary};
                    border-radius: ${THEME.radius.md};
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s ease;
                }
                .billing-tab-button:hover {
                    background-color: ${THEME.colors.primaryLight};
                    color: ${THEME.colors.textMain};
                }
                .billing-tab-button.active {
                    background-color: ${THEME.colors.primary};
                    color: #FFFFFF;
                    font-weight: 600;
                    box-shadow: 0 1px 4px rgba(13,122,87,0.25);
                }
                .billing-tab-button.active:hover {
                    background-color: ${THEME.colors.primaryHover};
                    color: #FFFFFF;
                }
            ` }} />

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.025em', fontFamily: THEME.typography.fontFamilyMain }}>
                            Módulo de Facturación
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '1.1rem', marginTop: '0.4rem' }}>
                            Gestión de cortes operativos, archivos planos WorldOffice y devoluciones.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={() => handleCreateCut('AM')}
                            disabled={isProcessing}
                            className="primary-btn"
                        >
                            <Coffee size={16} strokeWidth={1.5} /> Generar Corte AM
                        </button>
                        <button 
                            onClick={() => handleCreateCut('PM')}
                            disabled={isProcessing}
                            className="primary-btn"
                        >
                            <Moon size={16} strokeWidth={1.5} /> Generar Corte PM
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
                        backgroundColor: scrollY > 50 ? 'rgba(255, 255, 255, 0.95)' : THEME.colors.surface,
                        backdropFilter: scrollY > 50 ? 'blur(10px)' : 'none',
                        borderRadius: THEME.radius.lg,
                        padding: scrollY > 50 ? '0.75rem 1.5rem' : '1.5rem',
                        border: `1px solid ${THEME.colors.border}`,
                        boxShadow: scrollY > 50 ? THEME.shadow.lg : THEME.shadow.md,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', gap: '1rem', transition: 'all 0.3s', flex: 1 }}>
                            <KPIItem 
                                label="Pedidos Listos" 
                                value={pendingOrdersCount} 
                                icon={<Package size={18} strokeWidth={1.5} />} 
                                condensed={scrollY > 50} 
                            />
                            <KPIItem 
                                label="Cortes Abiertos" 
                                value={cuts.filter(c => c.status === 'open').length} 
                                icon={<Scissors size={18} strokeWidth={1.5} />} 
                                condensed={scrollY > 50} 
                            />
                            <KPIItem 
                                label="Novedades" 
                                value={returns.length} 
                                icon={<Truck size={18} strokeWidth={1.5} />} 
                                condensed={scrollY > 50} 
                            />
                            <KPIItem 
                                label="Prov. Incompletos" 
                                value={providers.filter(p => (!p.bank_name || !p.bank_account_number) && !p.is_archived).length} 
                                icon={<AlertTriangle size={18} strokeWidth={1.5} />} 
                                condensed={scrollY > 50} 
                            />
                        </div>

                        {!isProcessing && scrollY < 50 && (
                            <div style={{ textAlign: 'right', display: scrollY > 50 ? 'none' : 'block', marginLeft: '2rem' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Facturación Hoy</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                    {formatMoney(cuts.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
                                        .reduce((acc, c) => acc + (c.total_amount || 0), 0))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* TABS */}
                <div style={{ 
                    display: 'flex', 
                    background: THEME.colors.background, 
                    border: `1px solid ${THEME.colors.border}`, 
                    borderRadius: THEME.radius.lg, 
                    padding: '4px', 
                    gap: '2px', 
                    marginBottom: '2rem',
                    width: 'fit-content'
                }}>
                    {[
                        { id: 'cuts', label: 'Cortes Diarios', icon: <Package size={16} strokeWidth={1.5} /> },
                        { id: 'returns', label: 'Devoluciones', icon: <Truck size={16} strokeWidth={1.5} /> },
                        { id: 'providers', label: 'Proveedores', icon: <Building2 size={16} strokeWidth={1.5} /> },
                        { id: 'archived', label: 'Archivados', icon: <Archive size={16} strokeWidth={1.5} /> },
                        { id: 'configuration', label: 'Configuración', icon: <Settings size={16} strokeWidth={1.5} /> }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`billing-tab-button ${activeTab === tab.id ? 'active' : ''}`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.md }}>
                    {activeTab === 'cuts' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
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
                                    const status = getStatusStyle(cut.status);
                                    return (
                                        <tr key={cut.id} className="billing-row">
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>{cut.cut_number.toString().padStart(4, '0')}</div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{new Date(cut.scheduled_date).toLocaleDateString()}</div>
                                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Franja: {cut.cut_slot}</div>
                                            </td>
                                            <td style={tdStyle}>{formatNumber(cut.total_orders)} pedidos</td>
                                            <td style={{ ...tdStyle, fontWeight: '700', color: THEME.colors.textMain }}>{formatMoney(cut.total_amount || 0)}</td>
                                            <td style={tdStyle}>
                                                <span style={{ backgroundColor: status.bg, color: status.text, padding: '0.3rem 0.8rem', borderRadius: THEME.radius.sm, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                <button 
                                                    onClick={() => exportToWorldOffice(cut.id)}
                                                    className="outline-btn"
                                                    style={{ marginRight: '0.5rem' }}
                                                >
                                                    <Download size={14} strokeWidth={1.5} /> Exportar WO
                                                </button>
                                                <Link href={`/admin/commercial/billing/print/${cut.id}`} target="_blank">
                                                    <button className="primary-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                                                        <Printer size={14} strokeWidth={1.5} /> Documentos
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
                                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: THEME.colors.textSecondary }}>
                                        <Package size={48} strokeWidth={1.5} color={THEME.colors.primary} style={{ marginBottom: '1rem' }} />
                                        <h3 style={{ fontWeight: '600', color: THEME.colors.textMain }}>No hay devoluciones pendientes</h3>
                                        <p>Todas las remisiones coinciden con lo entregado.</p>
                                    </div>
                                ) : returns.map((ret) => (
                                    <div key={ret.id} style={{ 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        borderRadius: THEME.radius.lg, 
                                        padding: '1.5rem', 
                                        backgroundColor: THEME.colors.surface, 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '1rem',
                                        boxShadow: THEME.shadow.sm
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pedido #{getFriendlyOrderId({ created_at: ret.orders.created_at, sequence_id: ret.orders.sequence_id })}</div>
                                                <h3 style={{ margin: '0.2rem 0', fontWeight: '600', fontSize: '1.1rem', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>{ret.products.name}</h3>
                                            </div>
                                            <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '0.3rem 0.6rem', borderRadius: THEME.radius.sm, fontSize: '0.75rem', fontWeight: '600' }}>
                                                -{formatNumber(ret.quantity_returned)} Uds
                                            </div>
                                        </div>
                                        
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '1rem', flex: 1 }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo del Conductor:</div>
                                            <p style={{ margin: 0, fontSize: '0.875rem', color: THEME.colors.textMain }}>&quot;{ret.reason || 'Sin observación'}&quot;</p>
                                        </div>

                                        {ret.photo_url && (
                                            <img src={ret.photo_url} alt="Remisión" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }} />
                                        )}

                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                            <button 
                                                onClick={() => handleProcessReturn(ret, 'rejected')}
                                                disabled={isProcessing}
                                                className="outline-btn"
                                                style={{ flex: 1, justifyContent: 'center' }}
                                            >
                                                <X size={14} strokeWidth={1.5} /> Rechazar
                                            </button>
                                            <button 
                                                onClick={() => handleProcessReturn(ret, 'approved')}
                                                disabled={isProcessing}
                                                className="primary-btn"
                                                style={{ flex: 2, justifyContent: 'center', fontSize: '0.75rem' }}
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', backgroundColor: THEME.colors.surface, padding: '1.25rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, margin: '1rem' }}>
                                <div style={{ position: 'relative', width: '400px' }}>
                                    <Search size={16} strokeWidth={1.5} color={THEME.colors.textSecondary} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar por nombre, NIT, contacto..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.85rem 1rem 0.85rem 2.8rem', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.border}`,
                                            fontSize: '0.95rem',
                                            outline: 'none',
                                            backgroundColor: THEME.colors.background,
                                            color: THEME.colors.textMain
                                        }}
                                    />
                                </div>
                                
                                {activeTab === 'providers' && (
                                    <Link href="/admin/procurement/providers" style={{ textDecoration: 'none' }}>
                                        <button className="primary-btn">
                                            <Building2 size={16} strokeWidth={1.5} /> Gestionar Proveedores en Compras
                                        </button>
                                    </Link>
                                )}
                            </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
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
                                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>Cargando proveedores...</td></tr>
                                ) : providers
                                    .filter(p => activeTab === 'providers' ? !p.is_archived : p.is_archived)
                                    .filter(p => {
                                        const search = searchTerm.toLowerCase();
                                        return p.name.toLowerCase().includes(search) || 
                                               (p.tax_id || '').toLowerCase().includes(search) ||
                                               (p.contact_name || '').toLowerCase().includes(search) ||
                                               (p.category || '').toLowerCase().includes(search);
                                    }).length === 0 ? (
                                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No se encontraron proveedores.</td></tr>
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
                                    <tr key={p.id} className="billing-row" style={{ 
                                        opacity: p.is_archived ? 0.7 : 1,
                                        backgroundColor: isIncomplete && !p.is_archived ? '#FFFBEB' : 'transparent'
                                    }}>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>{p.name}</div>
                                                {isIncomplete && !p.is_archived && (
                                                    <span style={{ 
                                                        backgroundColor: '#F59E0B', 
                                                        color: 'white', 
                                                        fontSize: '0.6rem', 
                                                        padding: '0.1rem 0.4rem', 
                                                        borderRadius: '4px', 
                                                        fontWeight: '700' 
                                                    }}>
                                                        COMPLETAR
                                                    </span>
                                                )}
                                            </div>
                                            {p.tax_id && <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>NIT: {p.tax_id}</div>}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{p.contact_name || 'Sin contacto'}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: '0.85rem', color: THEME.colors.textMain, fontWeight: '600' }}>{p.contact_phone || '---'}</div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>{p.email || ''}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>{p.created_at ? new Date(p.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '---'}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{p.location || '---'}</div>
                                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.background, padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: '700' }}>
                                                {p.category}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ 
                                                backgroundColor: p.is_active ? '#DCFCE7' : '#FEE2E2', 
                                                color: p.is_active ? '#166534' : '#991B1B', 
                                                padding: '0.3rem 0.8rem', borderRadius: THEME.radius.sm, fontSize: '0.75rem', fontWeight: '700' 
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
                                                className="outline-btn"
                                            >
                                                <Eye size={14} strokeWidth={1.5} /> Detalles
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
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>Configuración del Sistema de Facturación</h2>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                {/* DOCUMENTACIÓN */}
                                <div style={configCard}>
                                    <h3 style={configTitle}><FileText size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Prefijos y Numeración</h3>
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
                                    <h3 style={configTitle}><Scale size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Impuestos y Tasas</h3>
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
                                    <h3 style={configTitle}><Clock size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Horarios de Corte Automático</h3>
                                    <div style={{ display: 'flex', gap: '2rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Hora Cierre Corte AM</label>
                                            <input type="time" defaultValue="12:00" style={inputStyle} />
                                            <p style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.5rem' }}>Pedidos recibidos antes de esta hora entran en el primer bulto de facturación.</p>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Hora Cierre Corte PM</label>
                                            <input type="time" defaultValue="18:00" style={inputStyle} />
                                            <p style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.5rem' }}>Pedidos finales del día para despacho nocturno o primera hora mañana.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* WORLD OFFICE */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <h3 style={configTitle}><Settings size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Exportación WorldOffice</h3>
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
                                <button className="primary-btn">
                                    Guardar Configuración
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL EDICIÓN PROVEEDOR (VISTA DE SOLO LECTURA EN FACTURACIÓN) */}
            {isModalOpen && selectedProvider && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26, 35, 30, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg }}>
                        <div style={{ 
                            padding: '1.5rem 2rem', 
                            backgroundColor: THEME.colors.surface, 
                            borderBottom: `1px solid ${THEME.colors.border}`,
                            borderLeft: `3px solid ${THEME.colors.primary}`,
                            color: THEME.colors.textMain,
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center' 
                        }}>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: '600', margin: 0, letterSpacing: '-0.025em', fontFamily: THEME.typography.fontFamilyMain }}>
                                    Ficha del Proveedor
                                </h2>
                                <p style={{ color: THEME.colors.textSecondary, marginTop: '0.25rem', fontSize: '0.875rem' }}>
                                    {selectedProvider.name || 'Detalles'}
                                </p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="outline-btn"
                                style={{ padding: '0.5rem', borderRadius: '50%' }}
                            >
                                <X size={18} strokeWidth={1.5} />
                            </button>
                        </div>

                        {/* WARNING READ-ONLY BANNER */}
                        <div style={{
                            backgroundColor: THEME.colors.primaryLight,
                            borderLeft: `3px solid ${THEME.colors.primary}`,
                            padding: '1rem 2rem',
                            color: THEME.colors.textMain,
                            fontSize: '0.9rem',
                            fontWeight: '500',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1.5rem',
                            borderBottom: `1px solid ${THEME.colors.border}`
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <AlertTriangle size={20} strokeWidth={1.5} color={THEME.colors.primary} />
                                <div>
                                    <div style={{ fontWeight: '600' }}>Vista de Solo Lectura</div>
                                    <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, marginTop: '0.1rem' }}>
                                        Este panel es informativo. Para crear, modificar o archivar proveedores, dirígete al módulo de compras.
                                    </div>
                                </div>
                            </div>
                            <Link href="/admin/procurement/providers">
                                <button type="button" className="outline-btn" style={{ borderColor: THEME.colors.primary, color: THEME.colors.primary, whiteSpace: 'nowrap' }}>
                                    Ir a Compras ↗
                                </button>
                            </Link>
                        </div>
                        
                        <div style={{ padding: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                {/* Info Básica */}
                                <div style={configCard}>
                                    <h3 style={configTitle}><Clipboard size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Información Básica</h3>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>Razon Social / Nombre</label>
                                        <input type="text" value={selectedProvider.name} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>NIT / Tax ID</label>
                                        <input type="text" value={selectedProvider.tax_id || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Categoría</label>
                                            <select 
                                                value={selectedProvider.category || ''} 
                                                style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }}
                                                disabled
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
                                            <select value={selectedProvider.is_active ? 'true' : 'false'} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} disabled>
                                                <option value="true">Activo</option>
                                                <option value="false">Inactivo</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Contacto */}
                                <div style={configCard}>
                                    <h3 style={configTitle}><Phone size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Contacto y Ubicación</h3>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={labelStyle}>Nombre de Contacto</label>
                                        <input type="text" value={selectedProvider.contact_name || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Teléfono</label>
                                            <input type="text" value={selectedProvider.contact_phone || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Email</label>
                                            <input type="email" value={selectedProvider.email || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Ubicación (Bodega/Puesto)</label>
                                            <input type="text" value={selectedProvider.location || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Dirección Física</label>
                                            <input type="text" value={selectedProvider.address || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '1rem' }}>
                                        <label style={labelStyle}>Fecha de Registro</label>
                                        <input 
                                            type="datetime-local" 
                                            value={selectedProvider.created_at ? new Date(selectedProvider.created_at).toISOString().slice(0, 16) : ''} 
                                            style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} 
                                            readOnly
                                        />
                                    </div>
                                </div>

                                {/* Financiero */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <h3 style={configTitle}><DollarSign size={16} strokeWidth={1.5} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: THEME.colors.primary }} /> Información Financiera</h3>
                                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Banco</label>
                                            <input type="text" value={selectedProvider.bank_name || ''} style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Número de Cuenta</label>
                                            <input type="text" value={selectedProvider.bank_account_number || ''} style={{ ...inputStyle, backgroundColor: '#F1F5F9', color: '#64748B', cursor: 'default' }} readOnly />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={labelStyle}>Tipo Cuenta</label>
                                            <select 
                                                value={selectedProvider.bank_account_type || ''} 
                                                style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }}
                                                disabled
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
                                                style={{ ...inputStyle, backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} 
                                                readOnly 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Notas */}
                                <div style={{ ...configCard, gridColumn: '1 / -1' }}>
                                    <label style={labelStyle}>Notas Internas</label>
                                    <textarea value={selectedProvider.notes || ''} style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit', backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, cursor: 'default' }} readOnly />
                                </div>
                            </div>

                            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="primary-btn" style={{ padding: '1rem 2.5rem' }}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

const configCard: React.CSSProperties = { padding: '1.5rem', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.background };
const configTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: '600', marginBottom: '1.5rem', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, fontSize: '1rem', backgroundColor: 'white', color: THEME.colors.textMain };

const thStyle: React.CSSProperties = { padding: '0.65rem 1.25rem', textAlign: 'left', fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: React.CSSProperties = { padding: '0.65rem 1.25rem', fontSize: '0.875rem', color: THEME.colors.textMain };

function KPIItem({ label, value, icon, condensed }: { label: string, value: number, icon: React.ReactNode, condensed: boolean }) {
    return (
        <div className="kpi-card" style={{
            padding: condensed ? '0.5rem 1rem' : '1rem 1.5rem',
            flex: 1,
            minWidth: condensed ? 'auto' : '180px'
        }}>
            <div style={{ 
                backgroundColor: THEME.colors.primaryLight, 
                width: condensed ? '32px' : '44px', 
                height: condensed ? '32px' : '44px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                borderRadius: '50%',
                transition: 'all 0.3s',
                color: THEME.colors.primary,
                flexShrink: 0
            }}>
                {icon}
            </div>
            <div>
                {!condensed && <div style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>}
                <div style={{ 
                    fontSize: condensed ? '1rem' : '1.3rem', 
                    fontWeight: '700', 
                    color: THEME.colors.textMain,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                }}>
                    {formatNumber(value)}
                    {condensed && <span style={{ fontSize: '0.65rem', fontWeight: '500', color: THEME.colors.textSecondary }}>{label}</span>}
                </div>
            </div>
        </div>
    );
}
