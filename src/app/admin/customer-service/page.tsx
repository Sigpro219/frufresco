'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    MessageSquare, AlertTriangle, CheckCircle2, Clock, Search, 
    Building2, User, Calendar, Plus, Trash2, Loader2, ArrowRight,
    Play, Eye, CornerDownRight, FileText, Camera
} from 'lucide-react';
import Link from 'next/link';

interface PQR {
    id: string;
    client_id: string;
    order_id: string | null;
    type: 'queja' | 'reclamo' | 'peticion' | 'sugerencia' | 'felicitacion';
    category: 'producto' | 'entrega' | 'facturacion' | 'otro';
    subject: string;
    description: string;
    primary_photo_url: string | null;
    additional_photos: string[] | null;
    status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    created_at: string;
    resolved_at: string | null;
    resolution_notes: string | null;
    profiles?: {
        company_name: string;
        contact_name: string;
        role: string;
        nit: string;
    } | null;
    orders?: {
        sequence_id: number;
        total: number;
        created_at: string;
    } | null;
}

export default function CustomerServicePage() {
    const [pqrs, setPqrs] = useState<PQR[]>([]);
    const [novelties, setNovelties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'resolved' | 'novelties'>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPqr, setSelectedPqr] = useState<PQR | null>(null);
    const [selectedNovelty, setSelectedNovelty] = useState<any | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Carousel state
    const [activePhotoIdx, setActivePhotoIdx] = useState(0);

    // Novelty creation state (for product-related PQRs with orders)
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [noveltyQty, setNoveltyQty] = useState(0);
    const [noveltyType, setNoveltyType] = useState<'faltante' | 'averia'>('faltante');
    const [noveltyReason, setNoveltyReason] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch PQRs
            const { data: pqrsData, error: pqrsError } = await supabase
                .from('customer_service_pqrs')
                .select(`
                    *,
                    profiles:client_id(company_name, contact_name, role, nit),
                    orders:order_id(sequence_id, total, created_at)
                `)
                .order('created_at', { ascending: false });

            if (pqrsError) throw pqrsError;
            setPqrs(pqrsData || []);

            // 2. Fetch Billing Returns (Novelties)
            const { data: returnsData, error: returnsError } = await supabase
                .from('billing_returns')
                .select(`
                    *,
                    products(name, sku, unit_of_measure),
                    orders(
                        sequence_id,
                        total,
                        created_at,
                        profiles(company_name, contact_name, role, nit)
                    )
                `)
                .order('created_at', { ascending: false });

            if (returnsError) throw returnsError;
            setNovelties(returnsData || []);
        } catch (e) {
            console.error('Error fetching PQRs/novelties:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePqrSelect = async (pqr: PQR) => {
        setSelectedPqr(pqr);
        setResolutionNotes(pqr.resolution_notes || '');
        setActivePhotoIdx(0);
        setSelectedItemId('');
        setNoveltyQty(0);
        setNoveltyReason('');

        // If PQR has an associated order, load its items to allow registering novelties
        if (pqr.order_id) {
            setLoadingItems(true);
            try {
                const { data, error } = await supabase
                    .from('order_items')
                    .select(`
                        *,
                        products(name, sku, unit_of_measure)
                    `)
                    .eq('order_id', pqr.order_id);
                if (error) throw error;
                setOrderItems(data || []);
            } catch (e) {
                console.error('Error fetching order items:', e);
            } finally {
                setLoadingItems(false);
            }
        } else {
            setOrderItems([]);
        }
    };

    // Update PQR Status / Resolution
    const handleResolvePqr = async (status: 'resolved' | 'rejected') => {
        if (!selectedPqr || !resolutionNotes.trim()) {
            alert('Por favor, ingresa una nota de resolución antes de guardar.');
            return;
        }

        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('customer_service_pqrs')
                .update({
                    status: status,
                    resolution_notes: resolutionNotes,
                    resolved_at: new Date().toISOString()
                })
                .eq('id', selectedPqr.id);

            if (error) throw error;

            // Update local state
            setPqrs(pqrs.map(p => p.id === selectedPqr.id ? { 
                ...p, 
                status, 
                resolution_notes: resolutionNotes, 
                resolved_at: new Date().toISOString() 
            } : p));

            setSelectedPqr({
                ...selectedPqr,
                status,
                resolution_notes: resolutionNotes,
                resolved_at: new Date().toISOString()
            });

            alert('PQR actualizada correctamente.');
            fetchData();
        } catch (e: any) {
            alert('Error al actualizar PQR: ' + e.message);
        } finally {
            setActionLoading(false);
        }
    };

    // Add novelty that affects order totals & billing_returns
    const handleCreateNovelty = async () => {
        if (!selectedPqr?.order_id || !selectedItemId || noveltyQty <= 0) {
            alert('Por favor, completa todos los campos de la novedad.');
            return;
        }

        setActionLoading(true);
        try {
            const selectedItem = orderItems.find(i => i.id === selectedItemId);
            if (!selectedItem) throw new Error('Artículo no encontrado en el pedido.');

            if (noveltyQty > selectedItem.quantity) {
                alert(`La cantidad no puede superar la cantidad despachada original (${selectedItem.quantity}).`);
                setActionLoading(false);
                return;
            }

            // 1. Insert record into billing_returns
            const { error: returnErr } = await supabase
                .from('billing_returns')
                .insert([{
                    order_id: selectedPqr.order_id,
                    product_id: selectedItem.product_id,
                    quantity_returned: noveltyQty,
                    reason: noveltyReason || `Novedad de PQR: ${selectedPqr.subject}`,
                    status: 'pending_review' // Will show up in billing/returns for approval
                }]);

            if (returnErr) throw returnErr;

            alert('Novedad de artículo registrada exitosamente para cobro y cartera. El equipo de facturación la verá en el siguiente corte.');
            setSelectedItemId('');
            setNoveltyQty(0);
            setNoveltyReason('');
        } catch (e: any) {
            alert('Error al registrar novedad: ' + e.message);
        } finally {
            setActionLoading(false);
        }
    };

    const getPqrPhotos = (pqr: PQR) => {
        const list: string[] = [];
        if (pqr.primary_photo_url) list.push(pqr.primary_photo_url);
        if (pqr.additional_photos && Array.isArray(pqr.additional_photos)) {
            list.push(...pqr.additional_photos);
        }
        return list;
    };

    const filteredPqrs = pqrs.filter(p => {
        const matchesTab = activeTab === 'resolved' 
            ? p.status === 'resolved' || p.status === 'rejected'
            : p.status === 'pending' || p.status === 'in_progress';

        if (!matchesTab) return false;

        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            p.subject.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            (p.profiles?.company_name || '').toLowerCase().includes(term) ||
            (p.profiles?.contact_name || '').toLowerCase().includes(term)
        );
    });

    const filteredNovelties = novelties.filter(n => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (n.products?.name || '').toLowerCase().includes(term) ||
            (n.reason || '').toLowerCase().includes(term) ||
            (n.orders?.profiles?.company_name || '').toLowerCase().includes(term) ||
            (n.orders?.profiles?.contact_name || '').toLowerCase().includes(term)
        );
    });

    const handleProcessNovelty = async (novelty: any, decision: 'approved' | 'rejected') => {
        setActionLoading(true);
        try {
            if (decision === 'rejected') {
                const { error } = await supabase
                    .from('billing_returns')
                    .update({ status: 'rejected' })
                    .eq('id', novelty.id);
                if (error) throw error;
            } else {
                // Get unit price
                const { data: itemData, error: itemError } = await supabase
                    .from('order_items')
                    .select('unit_price, quantity')
                    .eq('order_id', novelty.order_id)
                    .eq('product_id', novelty.product_id)
                    .single();
                if (itemError) throw itemError;

                const newQty = Math.max(0, Number(itemData.quantity) - Number(novelty.quantity_returned));
                const priceCredit = Number(novelty.quantity_returned) * Number(itemData.unit_price);

                // Subtract from items
                const { error: updateItemError } = await supabase
                    .from('order_items')
                    .update({ quantity: newQty })
                    .eq('order_id', novelty.order_id)
                    .eq('product_id', novelty.product_id);
                if (updateItemError) throw updateItemError;

                // Subtract from order total
                const { data: orderData } = await supabase.from('orders').select('total').eq('id', novelty.order_id).single();
                const newTotal = Math.max(0, (Number(orderData?.total) || 0) - priceCredit);
                const { error: updateOrderError } = await supabase
                    .from('orders')
                    .update({ total: newTotal })
                    .eq('id', novelty.order_id);
                if (updateOrderError) throw updateOrderError;

                // Recalculate billing_invoices details for this order
                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', novelty.order_id).single();
                if (invoiceData) {
                    // Fetch if client is iva responsible to adjust bases
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles(iva_responsible)')
                        .eq('id', novelty.order_id)
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

                // Update status of return to approved
                await supabase.from('billing_returns').update({ status: 'approved' }).eq('id', novelty.id);
            }
            alert(`✅ Novedad procesada: ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'}`);
            fetchData();
            setSelectedNovelty(null);
        } catch (err: any) {
            console.error('Error processing novelty:', err);
            alert('Error al procesar la novedad: ' + err.message);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1rem 2rem' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>
                                <MessageSquare size={18} />
                            </div>
                            <h1 style={{ fontSize: '1.8rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.03em' }}>Atención al Cliente</h1>
                        </div>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', marginTop: '0.15rem', fontWeight: '500' }}>
                            Centro de gestión de PQRs, reclamos comerciales e inconformidades de producto.
                        </p>
                    </div>
                </header>

                {/* Main Content Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                    
                    {/* Left Panel: List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Search and Filters */}
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                            <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
                                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}><Search size={16} /></span>
                                <input 
                                    type="text"
                                    placeholder="Buscar por cliente o asunto..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '8px 8px 8px 2.2rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.85rem', outline: 'none' }}
                                />
                            </div>

                            {/* Section Tabs */}
                            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                                <button 
                                    onClick={() => { setActiveTab('pending'); setSelectedPqr(null); setSelectedNovelty(null); }}
                                    style={{ flex: 1, padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', backgroundColor: activeTab === 'pending' ? 'white' : 'transparent', color: activeTab === 'pending' ? '#0D7A57' : '#64748B', transition: 'all 0.15s' }}
                                >
                                    PQRs Activas
                                </button>
                                <button 
                                    onClick={() => { setActiveTab('resolved'); setSelectedPqr(null); setSelectedNovelty(null); }}
                                    style={{ flex: 1, padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', backgroundColor: activeTab === 'resolved' ? 'white' : 'transparent', color: activeTab === 'resolved' ? '#0D7A57' : '#64748B', transition: 'all 0.15s' }}
                                >
                                    Historial PQR
                                </button>
                                <button 
                                    onClick={() => { setActiveTab('novelties'); setSelectedPqr(null); setSelectedNovelty(null); }}
                                    style={{ flex: 1, padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', backgroundColor: activeTab === 'novelties' ? 'white' : 'transparent', color: activeTab === 'novelties' ? '#0D7A57' : '#64748B', transition: 'all 0.15s' }}
                                >
                                    Novedades
                                </button>
                            </div>
                        </div>

                        {/* PQRs or Novelties List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', paddingRight: '4px' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="animate-spin" size={24} style={{ color: '#0D7A57', margin: '0 auto' }} /></div>
                            ) : activeTab === 'novelties' ? (
                                filteredNovelties.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.85rem' }}>
                                        No hay novedades de despacho registradas.
                                    </div>
                                ) : (
                                    filteredNovelties.map(n => {
                                        const isSelected = selectedNovelty?.id === n.id;
                                        const clientName = n.orders?.profiles?.company_name || n.orders?.profiles?.contact_name || 'Cliente Desconocido';
                                        return (
                                            <div 
                                                key={n.id}
                                                onClick={() => setSelectedNovelty(n)}
                                                style={{
                                                    backgroundColor: isSelected ? '#EAEFEA' : 'white',
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    border: `1px solid ${isSelected ? '#0D7A57' : '#E2E8F0'}`,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
                                                }}
                                                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.borderColor = '#94A3B8'; }}
                                                onMouseLeave={e => { if(!isSelected) e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', 
                                                        fontWeight: '800', 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px',
                                                        textTransform: 'uppercase',
                                                        backgroundColor: n.status === 'approved' ? '#DCFCE7' : n.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                                        color: n.status === 'approved' ? '#15803D' : n.status === 'rejected' ? '#EF4444' : '#B45309'
                                                    }}>
                                                        {n.status === 'pending_review' ? 'Pendiente' : n.status === 'approved' ? 'Aprobada' : n.status === 'rejected' ? 'Rechazada' : n.status}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '500' }}>
                                                        {new Date(n.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#1E293B', lineHeight: '1.2' }}>
                                                    {n.products?.name} (x{n.quantity_returned})
                                                </h4>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748B', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Building2 size={12} />
                                                    {clientName}
                                                </p>
                                                {n.orders?.sequence_id && (
                                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#0D7A57', fontWeight: '700' }}>
                                                        Pedido #{n.orders.sequence_id}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })
                                )
                            ) : (
                                filteredPqrs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.85rem' }}>
                                        No hay casos en esta bandeja.
                                    </div>
                                ) : (
                                    filteredPqrs.map(p => {
                                        const isSelected = selectedPqr?.id === p.id;
                                        return (
                                            <div 
                                                key={p.id}
                                                onClick={() => handlePqrSelect(p)}
                                                style={{
                                                    backgroundColor: isSelected ? '#EAEFEA' : 'white',
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    border: `1px solid ${isSelected ? '#0D7A57' : '#E2E8F0'}`,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
                                                }}
                                                onMouseEnter={e => { if(!isSelected) e.currentTarget.style.borderColor = '#94A3B8'; }}
                                                onMouseLeave={e => { if(!isSelected) e.currentTarget.style.borderColor = '#E2E8F0'; }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', 
                                                        fontWeight: '800', 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px',
                                                        textTransform: 'uppercase',
                                                        backgroundColor: p.priority === 'urgent' || p.priority === 'high' ? '#FEE2E2' : '#F1F5F9',
                                                        color: p.priority === 'urgent' || p.priority === 'high' ? '#EF4444' : '#64748B'
                                                    }}>
                                                        {p.type}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '500' }}>
                                                        {new Date(p.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#1E293B', lineHeight: '1.2' }}>{p.subject}</h4>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748B', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {p.profiles?.role === 'b2b_client' ? <Building2 size={12} /> : <User size={12} />}
                                                    {p.profiles?.company_name || p.profiles?.contact_name}
                                                </p>
                                            </div>
                                        );
                                    })
                                )
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Detail view */}
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', minHeight: '500px' }}>
                        {activeTab === 'novelties' ? (
                            selectedNovelty ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {/* Detail Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', gap: '1rem' }}>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '900', color: '#1E293B' }}>
                                                Novedad: {selectedNovelty.products?.name}
                                            </h2>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#EAEFEA', color: '#0D7A57', textTransform: 'uppercase' }}>
                                                    Cantidad: {selectedNovelty.quantity_returned} {selectedNovelty.products?.unit_of_measure}
                                                </span>
                                                {selectedNovelty.orders && (
                                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#E0F2FE', color: '#0369A1' }}>
                                                        PEDIDO #{selectedNovelty.orders.sequence_id}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: '800',
                                                padding: '4px 10px',
                                                borderRadius: '9999px',
                                                backgroundColor: selectedNovelty.status === 'approved' ? '#DCFCE7' : selectedNovelty.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                                color: selectedNovelty.status === 'approved' ? '#15803D' : selectedNovelty.status === 'rejected' ? '#EF4444' : '#B45309',
                                                textTransform: 'uppercase',
                                                border: '1px solid currentColor'
                                            }}>
                                                {selectedNovelty.status === 'pending_review' ? 'Pendiente' : selectedNovelty.status === 'approved' ? 'Aprobada y Descontada' : 'Rechazada'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Main Reason & Client Info */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.8rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Motivo de la novedad</h4>
                                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                {selectedNovelty.reason || 'Sin motivo detallado'}
                                            </p>
                                        </div>
                                        <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Datos del Cliente</h4>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Building2 size={14} />
                                                {selectedNovelty.orders?.profiles?.company_name || selectedNovelty.orders?.profiles?.contact_name || 'Cliente Desconocido'}
                                            </div>
                                            {selectedNovelty.orders?.profiles?.nit && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>NIT: {selectedNovelty.orders.profiles.nit}</div>}
                                            {selectedNovelty.orders && (
                                                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '4px', fontSize: '0.75rem', color: '#64748B' }}>
                                                    <strong>Venta original:</strong> {formatMoney(selectedNovelty.orders.total)} <br />
                                                    <strong>Fecha venta:</strong> {new Date(selectedNovelty.orders.created_at).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Photo Evidence if present */}
                                    {selectedNovelty.photo_url && (
                                        <div>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Camera size={14} /> Evidencia fotográfica de la novedad
                                            </h4>
                                            <div style={{ width: '280px', height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', backgroundColor: '#F1F5F9' }}>
                                                <img 
                                                    src={selectedNovelty.photo_url} 
                                                    alt="Evidencia novedad" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons if Pending */}
                                    {selectedNovelty.status === 'pending_review' && (
                                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1.25rem', display: 'flex', gap: '1rem', maxWidth: '400px' }}>
                                            <button 
                                                disabled={actionLoading}
                                                onClick={() => handleProcessNovelty(selectedNovelty, 'approved')}
                                                style={{ flex: 1, backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <CheckCircle2 size={16} /> Aprobar y Descontar
                                            </button>
                                            <button 
                                                disabled={actionLoading}
                                                onClick={() => handleProcessNovelty(selectedNovelty, 'rejected')}
                                                style={{ flex: 1, backgroundColor: '#FEE2E2', color: '#EF4444', border: '1px solid #FFE4E6', padding: '10px', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                            >
                                                <AlertTriangle size={16} /> Rechazar Novedad
                                            </button>
                                        </div>
                                    )}

                                    {/* Processed/Status note */}
                                    {selectedNovelty.status === 'approved' && (
                                        <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #DCFCE7', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ fontWeight: '700', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <CheckCircle2 size={16} /> Novedad Aprobada y Aplicada
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#15803D' }}>
                                                Esta novedad ha sido aprobada y descontada del pedido. Se verá reflejada en la facturación final de esta compra.
                                            </p>
                                        </div>
                                    )}
                                    {selectedNovelty.status === 'rejected' && (
                                        <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FFE4E6', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ fontWeight: '700', color: '#991B1B', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <AlertTriangle size={16} /> Novedad Rechazada
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#B91C1C' }}>
                                                Esta novedad fue rechazada y archivada sin aplicar ningún descuento sobre la facturación.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', padding: '4rem 0' }}>
                                    <MessageSquare size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
                                    <h3 style={{ margin: 0, fontWeight: '700', fontSize: '1rem' }}>No hay novedad seleccionada</h3>
                                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>Selecciona una novedad de la lista para ver sus detalles y procesar su aprobación/rechazo.</p>
                                </div>
                            )
                        ) : selectedPqr ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Detail Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem', gap: '1rem' }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '900', color: '#1E293B' }}>{selectedPqr.subject}</h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#EAEFEA', color: '#0D7A57', textTransform: 'uppercase' }}>
                                                {selectedPqr.category}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F1F5F9', color: '#64748B', textTransform: 'uppercase' }}>
                                                PRIORIDAD: {selectedPqr.priority}
                                            </span>
                                            {selectedPqr.orders && (
                                                <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#E0F2FE', color: '#0369A1' }}>
                                                    PEDIDO #{selectedPqr.orders.sequence_id}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            padding: '4px 10px',
                                            borderRadius: '9999px',
                                            backgroundColor: selectedPqr.status === 'resolved' ? '#DCFCE7' : selectedPqr.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                                            color: selectedPqr.status === 'resolved' ? '#15803D' : selectedPqr.status === 'rejected' ? '#EF4444' : '#B45309',
                                            textTransform: 'uppercase',
                                            border: '1px solid currentColor'
                                        }}>
                                            {selectedPqr.status === 'pending' ? 'Pendiente' : selectedPqr.status === 'in_progress' ? 'En Curso' : selectedPqr.status === 'resolved' ? 'Resuelto' : 'Rechazado'}
                                        </span>
                                    </div>
                                </div>

                                {/* Main Description & Client Info */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.8rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Descripción del caso</h4>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            {selectedPqr.description}
                                        </p>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Datos del Cliente</h4>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {selectedPqr.profiles?.role === 'b2b_client' ? <Building2 size={14} /> : <User size={14} />}
                                            {selectedPqr.profiles?.company_name || selectedPqr.profiles?.contact_name}
                                        </div>
                                        {selectedPqr.profiles?.nit && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>NIT: {selectedPqr.profiles.nit}</div>}
                                        {selectedPqr.orders && (
                                            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '4px', fontSize: '0.75rem', color: '#64748B' }}>
                                                <strong>Venta relacionada:</strong> {formatMoney(selectedPqr.orders.total)} <br />
                                                <strong>Fecha venta:</strong> {new Date(selectedPqr.orders.created_at).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Photo Evidence Carousel */}
                                {getPqrPhotos(selectedPqr).length > 0 && (
                                    <div>
                                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Camera size={14} /> Evidencia fotográfica de soporte ({getPqrPhotos(selectedPqr).length})
                                        </h4>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                            <div style={{ width: '280px', height: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', backgroundColor: '#F1F5F9', position: 'relative' }}>
                                                <img 
                                                    src={getPqrPhotos(selectedPqr)[activePhotoIdx]} 
                                                    alt="Evidencia cargada" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                            {/* Photo selectors list */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 60px)', gap: '8px' }}>
                                                {getPqrPhotos(selectedPqr).map((url, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => setActivePhotoIdx(idx)}
                                                        style={{ 
                                                            width: '60px', 
                                                            height: '60px', 
                                                            borderRadius: '6px', 
                                                            overflow: 'hidden', 
                                                            border: `2px solid ${idx === activePhotoIdx ? '#0D7A57' : '#E2E8F0'}`, 
                                                            cursor: 'pointer',
                                                            backgroundColor: '#F8FAFC'
                                                        }}
                                                    >
                                                        <img src={url} alt={`Thumb ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Resolviendo el caso */}
                                {selectedPqr.status === 'pending' && (
                                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1.25rem', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                                        {/* Resolution Notes form */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Notas de resolución comercial</h4>
                                            <textarea
                                                value={resolutionNotes}
                                                onChange={e => setResolutionNotes(e.target.value)}
                                                placeholder="Describe las acciones de resolución comercial tomadas para cerrar esta PQR..."
                                                rows={3}
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                            />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                <button 
                                                    disabled={actionLoading}
                                                    onClick={() => handleResolvePqr('resolved')}
                                                    style={{ flex: 1, backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                >
                                                    <CheckCircle2 size={14} /> Resolver y Cerrar
                                                </button>
                                                <button 
                                                    disabled={actionLoading}
                                                    onClick={() => handleResolvePqr('rejected')}
                                                    style={{ flex: 1, backgroundColor: '#FEE2E2', color: '#EF4444', border: '1px solid #FFE4E6', padding: '8px', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                >
                                                    <AlertTriangle size={14} /> Rechazar / Archivar
                                                </button>
                                            </div>
                                        </div>

                                        {/* Order novelties interface */}
                                        {selectedPqr.order_id && (
                                            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <CornerDownRight size={14} /> Registrar Novedad de Pedido
                                                </h4>
                                                
                                                {loadingItems ? (
                                                    <Loader2 className="animate-spin" size={16} />
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '2px', fontWeight: '600' }}>Producto Afectado</label>
                                                            <select
                                                                value={selectedItemId}
                                                                onChange={e => setSelectedItemId(e.target.value)}
                                                                style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.75rem', backgroundColor: 'white' }}
                                                            >
                                                                <option value="">Selecciona un producto del pedido...</option>
                                                                {orderItems.map(item => (
                                                                    <option key={item.id} value={item.id}>
                                                                        {item.products?.name} (SKU: {item.products?.sku}) — {item.quantity} {item.products?.unit_of_measure}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {selectedItemId && (
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px' }}>
                                                                <div>
                                                                    <label style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '2px', fontWeight: '600' }}>Tipo Novedad</label>
                                                                    <select
                                                                        value={noveltyType}
                                                                        onChange={e => setNoveltyType(e.target.value as any)}
                                                                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.75rem', backgroundColor: 'white' }}
                                                                    >
                                                                        <option value="faltante">Faltante</option>
                                                                        <option value="averia">Avería</option>
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '2px', fontWeight: '600' }}>Cantidad Faltante</label>
                                                                    <input 
                                                                        type="number"
                                                                        value={noveltyQty}
                                                                        onChange={e => setNoveltyQty(Number(e.target.value))}
                                                                        min={1}
                                                                        style={{ width: '100%', padding: '5px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.75rem', boxSizing: 'border-box' }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {selectedItemId && (
                                                            <div>
                                                                <label style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '2px', fontWeight: '600' }}>Comentarios adicionales</label>
                                                                <input 
                                                                    type="text"
                                                                    value={noveltyReason}
                                                                    onChange={e => setNoveltyReason(e.target.value)}
                                                                    placeholder="Ej: Caja golpeada, no se envió..."
                                                                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.75rem', boxSizing: 'border-box' }}
                                                                />
                                                            </div>
                                                        )}

                                                        <button 
                                                            disabled={actionLoading || !selectedItemId || noveltyQty <= 0}
                                                            onClick={handleCreateNovelty}
                                                            style={{ 
                                                                backgroundColor: selectedItemId && noveltyQty > 0 ? '#1E293B' : '#94A3B8', 
                                                                color: 'white', 
                                                                border: 'none', 
                                                                padding: '6px 12px', 
                                                                borderRadius: '6px', 
                                                                fontWeight: '700', 
                                                                fontSize: '0.75rem', 
                                                                cursor: selectedItemId && noveltyQty > 0 ? 'pointer' : 'not-allowed', 
                                                                marginTop: '4px' 
                                                            }}
                                                        >
                                                            Aplicar y reportar descuento
                                                        </button>

                                                        <Link href={`/admin/orders/loading?orderId=${selectedPqr.order_id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: '700', color: '#0D7A57', marginTop: '4px' }}>
                                                            <FileText size={12} /> Modificar pedido completo en Cargue de Pedidos <ArrowRight size={10} />
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Solved state display */}
                                {selectedPqr.status === 'resolved' && (
                                    <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #DCFCE7', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontWeight: '700', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <CheckCircle2 size={16} /> Caso resuelto y archivado
                                        </div>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#15803D', whiteSpace: 'pre-wrap' }}>
                                            <strong>Solución:</strong> {selectedPqr.resolution_notes}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', padding: '4rem 0' }}>
                                <MessageSquare size={48} strokeWidth={1} style={{ marginBottom: '1rem' }} />
                                <h3 style={{ margin: 0, fontWeight: '700', fontSize: '1rem' }}>No hay caso seleccionado</h3>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>Selecciona un caso de la lista para ver sus detalles y registrar novedades.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
