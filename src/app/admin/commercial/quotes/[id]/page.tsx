'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME } from '@/lib/adminTheme';
import { useParams, useRouter } from 'next/navigation';

export default function QuoteDetailPage() {
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
    const router = useRouter();
    const [quote, setQuote] = useState<any>(null);
    const [lead, setLead] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [converting, setConverting] = useState(false);
    const [creatingProfileFromLead, setCreatingProfileFromLead] = useState(false);

    // Client Selection for Conversion
    const [showClientModal, setShowClientModal] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [clientResults, setClientResults] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any>(null);

    // Conversion Modal
    const [showConversionModal, setShowConversionModal] = useState(false);
    const [conversionType, setConversionType] = useState<'order' | 'agreement'>('order');
    const [deliveryDate, setDeliveryDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    });
    const [validUntilDate, setValidUntilDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    });

    useEffect(() => {
        if (params.id) fetchQuoteDetails();
    }, [params.id]);

    const fetchQuoteDetails = async () => {
        setLoading(true);
        // Load Quote
        const { data: qData, error: qErr } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', params.id)
            .single();

        if (qErr) {
            alert('Error cargando cotización');
            return;
        }
        setQuote(qData);

        if (qData.lead_id) {
            const { data: lData } = await supabase
                .from('leads')
                .select('*')
                .eq('id', qData.lead_id)
                .single();
            if (lData) setLead(lData);
        }

        // Load Items (Joins product to get the name)
        const { data: iData } = await supabase
            .from('quote_items')
            .select('*, products(name)')
            .eq('quote_id', params.id);

        if (iData) setItems(iData);
        setLoading(false);
    };

    // --- CONVERSION LOGIC ---
    const handleConvertClick = async () => {
        if (quote.status === 'converted') return alert('Esta cotización ya fue convertida.');
        if (quote.status === 'agreement') return alert('Esta cotización ya es un Acuerdo Comercial activo.');

        // If we already have a client_id linked, fetch full profile to have role/address
        if (quote.client_id) {
            setConverting(true);
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, phone, address, role')
                .eq('id', quote.client_id)
                .single();
            
            setConverting(false);
            if (profile) {
                setSelectedClient(profile);
                setShowConversionModal(true);
            } else {
                setShowClientModal(true);
            }
        } else {
            // Need to link to a real user
            setShowClientModal(true);
        }
    };

    const searchClients = async (term: string) => {
        setClientSearch(term);
        if (term.length < 2) {
            setClientResults([]); return;
        }
        const { data } = await supabase
            .from('profiles')
            .select('id, company_name, contact_name, phone, address, role')
            .ilike('company_name', `%${term}%`)
            .limit(5);
        if (data) setClientResults(data);
    };

    const handleConvertLeadToProfile = async () => {
        if (!lead) return;
        setCreatingProfileFromLead(true);
        try {
            const { data: newProfile, error: pErr } = await supabase
                .from('profiles')
                .insert([{
                    role: 'b2b_client',
                    company_name: lead.company_name || 'Negocio desde Lead',
                    contact_name: lead.contact_name,
                    phone: lead.phone,
                    email: lead.email || null,
                    address: lead.notes?.split('|')[0]?.replace('📍 GPS: ', '') || 'Bogotá',
                    pricing_model_id: quote.model_id
                }])
                .select()
                .single();

            if (pErr) throw pErr;

            const { error: qErr } = await supabase
                .from('quotes')
                .update({ client_id: newProfile.id })
                .eq('id', quote.id);

            if (qErr) throw qErr;

            setSelectedClient(newProfile);
            setQuote((prev: any) => ({ ...prev, client_id: newProfile.id }));
            
            setShowClientModal(false);
            setShowConversionModal(true);
            
            alert('🎉 Se ha creado el perfil comercial B2B para: ' + (newProfile.company_name || newProfile.contact_name));
        } catch (err: any) {
            console.error('Error converting lead to profile:', err);
            alert('Error al crear perfil de cliente: ' + err.message);
        } finally {
            setCreatingProfileFromLead(false);
        }
    };

    const submitConversion = async () => {
        if (!selectedClient) return;
        setConverting(true);

        try {
            if (conversionType === 'order') {
                // 1. Create Order
                const { data: order, error: oErr } = await supabase
                    .from('orders')
                    .insert({
                        profile_id: selectedClient.id,
                        customer_name: selectedClient.company_name || selectedClient.contact_name,
                        customer_phone: selectedClient.phone || '',
                        status: 'pending_approval',
                        delivery_date: deliveryDate,
                        subtotal: quote.subtotal_amount || 0,
                        total: quote.total_amount || 0,
                        type: selectedClient.role === 'b2c_client' ? 'b2c_wompi' : 'b2b_credit', 
                        origin_source: 'web',
                        shipping_address: selectedClient.address || 'Dirección no especificada'
                    })
                    .select()
                    .single();

                if (oErr) throw oErr;

                try {
                    // 2. Create Order Items (populating tax-inclusive price, rate, and amount)
                    const itemsData = items.map(qi => {
                        const priceWithTax = Math.round((qi.unit_price || 0) * (1 + ((qi.iva_rate || 0) / 100)));
                        const itemTotal = priceWithTax * (qi.quantity || 1);
                        const rate = qi.iva_rate || 0;
                        const ivaAmount = rate > 0 ? itemTotal * (rate / (100 + rate)) : 0;
                        return {
                            order_id: order.id,
                            product_id: qi.product_id,
                            quantity: qi.quantity || 1,
                            unit_price: priceWithTax,
                            variant_label: '',
                            nickname: qi.product_name || (qi.products?.name || ''),
                            iva_rate: rate,
                            iva_amount: Math.round(ivaAmount)
                        };
                    });

                    const { error: iErr } = await supabase.from('order_items').insert(itemsData);
                    if (iErr) throw iErr;

                    // 3. Update Quote Status
                    const { error: qErr } = await supabase
                        .from('quotes')
                        .update({ status: 'converted', client_id: selectedClient.id, order_id: order.id }) 
                        .eq('id', quote.id);
                    if (qErr) throw qErr;

                    alert('✅ ¡Pedido Creado Exitosamente!');
                    router.push(`/admin/orders/${order.id}`); 
                } catch (innerErr) {
                    console.error('Error during order items creation, rolling back order:', innerErr);
                    await supabase.from('orders').delete().eq('id', order.id);
                    throw innerErr;
                }

            } else {
                // Commercial Agreement Flow
                const { error: agreementErr } = await supabase
                    .from('quotes')
                    .update({ 
                        status: 'agreement', 
                        client_id: selectedClient.id, 
                        valid_until: new Date(validUntilDate).toISOString(),
                        notes: (quote.notes || '') + '\n[CONVERTIDO A ACUERDO COMERCIAL]'
                    })
                    .eq('id', quote.id);
                
                if (agreementErr) throw agreementErr;
                
                alert('✅ ¡Acuerdo Comercial Registrado!');
                setShowConversionModal(false);
                fetchQuoteDetails();
            }

        } catch (err: any) {
            console.error(err);
            alert('Error al procesar: ' + err.message);
        } finally {
            setConverting(false);
        }
    };

    const getDaysRemaining = (dateStr: string) => {
        if (!dateStr) return null;
        const diff = new Date(dateStr).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
    if (!quote) return <div style={{ padding: '2rem' }}>Cotización no encontrada.</div>;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/commercial/quotes" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver</Link>
                </div>

                {quote.status === 'agreement' && (() => {
                    const days = getDaysRemaining(quote.valid_until);
                    if (days !== null && days <= 15) {
                        return (
                            <div style={{ 
                                backgroundColor: days < 0 ? '#FEF2F2' : '#FFFBEB', 
                                border: `1px solid ${days < 0 ? '#FECACA' : '#FDE68A'}`, 
                                padding: '1rem', 
                                borderRadius: '12px', 
                                marginBottom: '1.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px' 
                            }}>
                                <span style={{ fontSize: '1.4rem' }}>⚠️</span>
                                <div>
                                    <div style={{ fontWeight: 'bold', color: days < 0 ? '#991B1B' : '#92400E' }}>
                                        {days < 0 ? 'Este Acuerdo Comercial ha expirado' : `Este Acuerdo Comercial expira en ${days} días`}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: days < 0 ? '#B91C1C' : '#B45309' }}>
                                        Fecha límite: {new Date(quote.valid_until).toLocaleDateString()}. Los precios congelados dejarán de aplicarse después de esta fecha.
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()}

                {/* HEADER CARD */}
                <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#6B7280', fontWeight: 'bold' }}>{quote.quote_number ? formatQuoteNumber(quote.quote_number, quote.created_at) : 'Cotización'}</div>
                        <h1 style={{ fontSize: '2rem', margin: '0.5rem 0', fontWeight: '900' }}>{quote.client_name}</h1>
                        <div style={{ display: 'flex', gap: '1rem', color: '#4B5563' }}>
                            <span>Modelo: <strong>{quote.model_snapshot_name}</strong></span>
                            <span>Fecha: {new Date(quote.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#059669' }}>${formatPrice(quote.total_amount || 0)}</div>
                        <div style={{ marginBottom: '1rem' }}>Total Ofertado</div>

                        {quote.status === 'converted' ? (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <Link href={quote.order_id ? `/admin/orders/${quote.order_id}` : '/admin/orders'} style={{ textDecoration: 'none' }}>
                                    <button style={{ backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #10B981', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        ✓ CONVERTIDA A PEDIDO
                                        <span style={{ fontSize: '0.8rem', textDecoration: 'underline' }}>Ver documento →</span>
                                    </button>
                                </Link>
                                <button
                                    onClick={() => window.open(`/admin/commercial/quotes/${quote.id}/print`, '_blank')}
                                    style={{ backgroundColor: 'white', color: '#1F2937', border: '1px solid #D1D5DB', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    🖨️ Imprimir
                                </button>
                            </div>
                        ) : quote.status === 'agreement' ? (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button disabled style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #3B82F6', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    🤝 ACUERDO COMERCIAL
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>(Vigente)</span>
                                </button>
                                <button
                                    onClick={() => window.open(`/admin/commercial/quotes/${quote.id}/print`, '_blank')}
                                    style={{ backgroundColor: 'white', color: '#1F2937', border: '1px solid #D1D5DB', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    🖨️ Imprimir
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <Link href={`/admin/commercial/quotes/create?duplicate_from=${quote.id}`} style={{ textDecoration: 'none' }}>
                                    <button
                                        style={{ 
                                            backgroundColor: '#FFFBEB', 
                                            color: '#D97706', 
                                            border: '1px solid #F59E0B', 
                                            padding: '0.8rem 1.5rem', 
                                            borderRadius: '8px', 
                                            fontWeight: 'bold', 
                                            cursor: 'pointer', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '0.5rem',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#FEF3C7';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#FFFBEB';
                                        }}
                                    >
                                        📝 Ajustar Precios
                                    </button>
                                </Link>
                                <button
                                    onClick={handleConvertClick}
                                    disabled={converting}
                                    style={{ backgroundColor: '#111827', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
                                >
                                    {converting ? 'Procesando...' : '🚀 Convertir a Pedido'}
                                </button>
                                <button
                                    onClick={() => window.open(`/admin/commercial/quotes/${quote.id}/print`, '_blank')}
                                    style={{ backgroundColor: 'white', color: '#1F2937', border: '1px solid #D1D5DB', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    🖨️ Imprimir
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {lead && (
                    <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '1rem 1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: '900', textTransform: 'uppercase', marginBottom: '4px' }}>
                            🔥 Prospecto Vinculado (CRM Lead #{lead.id})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem', color: '#374151', marginTop: '6px' }}>
                            <div><strong>Contacto:</strong> {lead.contact_name || lead.company_name}</div>
                            {lead.nit && <div><strong>NIT:</strong> {lead.nit}</div>}
                            {lead.phone && <div><strong>Teléfono:</strong> {lead.phone}</div>}
                            {lead.email && <div><strong>Email:</strong> {lead.email}</div>}
                            {(lead.address || lead.municipality) && (
                                <div style={{ gridColumn: 'span 2' }}><strong>Dirección Declarada:</strong> {lead.address || ''}{lead.municipality ? ` - ${lead.municipality}` : ''}</div>
                            )}
                            {lead.business_type && <div><strong>Tipo Negocio:</strong> {lead.business_type}</div>}
                            {lead.business_size && <div><strong>Tamaño:</strong> {lead.business_size}</div>}
                        </div>
                    </div>
                )}

                {/* ITEMS TABLE */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem' }}>Producto</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem' }}>Cant</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem' }}>Costo Base</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem' }}>Margen</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'center' }}>IVA</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'right' }}>Precio Unit.</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '1rem', textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...items].sort((a, b) => {
                                const skuA = (a.sku || a.products?.sku || a.product_name || a.products?.name || '').toString().toLowerCase();
                                const skuB = (b.sku || b.products?.sku || b.product_name || b.products?.name || '').toString().toLowerCase();
                                return skuA.localeCompare(skuB, 'es', { numeric: true, sensitivity: 'base' });
                            }).map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.product_name || item.products?.name || 'Producto'}</td>
                                    <td style={{ padding: '1rem' }}>{item.quantity} {item.unit || ''}</td>
                                    <td style={{ padding: '1rem', color: '#6B7280' }}>${formatPrice(item.cost_basis || 0)}</td>
                                    <td style={{ padding: '1rem', color: '#2563EB', fontWeight: 'bold' }}>{Math.round((item.margin_percent || 0) * 10) / 10}%</td>
                                    <td style={{ padding: '1rem', textAlign: 'center', color: '#6B7280', fontSize: '0.9rem' }}>{item.iva_rate || 0}%</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatPrice(item.unit_price || 0)}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${formatPrice((item.quantity || 0) * (item.unit_price || 0))}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #E5E7EB' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>Subtotal antes de impuestos</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                    ${formatPrice(quote?.subtotal_amount || items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0))}
                                </td>
                            </tr>
                            <tr style={{ color: '#4B5563' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Impuestos</td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                    ${formatPrice(quote?.total_tax_amount || items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unit_price || 0)) * ((i.iva_rate || 0) / 100), 0))}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#F9FAFB' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900' }}>Total</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900', fontSize: '1.5rem', color: '#059669' }}>
                                    ${formatPrice(quote?.total_amount || 0)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* MODAL CLIENT SELECTION */}
            {showClientModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ marginTop: 0 }}>Vincular a Cliente Real</h2>
                        <p style={{ color: '#4B5563', marginBottom: '1.5rem' }}>
                            Para crear un pedido o registrar un acuerdo comercial, esta cotización debe estar asignada a un usuario registrado en el sistema.
                        </p>

                        {lead && (
                            <div style={{ 
                                backgroundColor: '#F0FDF4', 
                                border: '1px solid #BBF7D0', 
                                borderRadius: '8px', 
                                padding: '1rem', 
                                marginBottom: '1.5rem' 
                            }}>
                                <div style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 'bold', marginBottom: '4px' }}>✨ Prospecto Asociado Detectado</div>
                                <div style={{ fontWeight: '900', color: '#14532D', fontSize: '1rem' }}>{lead.company_name || lead.contact_name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#15803D', marginBottom: '10px' }}>
                                    Tel: {lead.phone || 'Sin teléfono'} • Contacto: {lead.contact_name}
                                </div>
                                <button
                                    onClick={handleConvertLeadToProfile}
                                    disabled={creatingProfileFromLead}
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px', 
                                        backgroundColor: '#16A34A', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '6px', 
                                        fontWeight: 'bold', 
                                        cursor: 'pointer',
                                        fontSize: '0.85rem' 
                                    }}
                                >
                                    {creatingProfileFromLead ? 'Creando Perfil...' : 'Convertir en Cliente B2B y Vincular'}
                                </button>
                            </div>
                        )}

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Buscar Cliente:</label>
                            <input
                                value={clientSearch}
                                onChange={e => searchClients(e.target.value)}
                                placeholder="Escribe el nombre del negocio..."
                                style={{ width: '100%', padding: '0.8rem', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                            />
                            {clientResults.length > 0 && (
                                <div style={{ border: '1px solid #E5E7EB', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto', marginTop: '0.5rem' }}>
                                    {clientResults.map(c => (
                                        <div
                                            key={c.id}
                                            onClick={() => setSelectedClient(c)}
                                            style={{ padding: '0.8rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', backgroundColor: selectedClient?.id === c.id ? '#EFF6FF' : 'white' }}
                                        >
                                            <div style={{ fontWeight: 'bold' }}>{c.company_name || c.contact_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{c.address} • {c.phone}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowClientModal(false)} style={{ padding: '0.8rem', background: 'none', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                            <button
                                onClick={() => {
                                    if(selectedClient) {
                                        setShowClientModal(false);
                                        setShowConversionModal(true);
                                    }
                                }}
                                disabled={!selectedClient || converting}
                                style={{ padding: '0.8rem 1.5rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: !selectedClient ? 0.5 : 1 }}
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONVERSION TYPE */}
            {showConversionModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ marginTop: 0 }}>Opciones de Conversión</h2>
                        <p style={{ color: '#4B5563', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                            Cliente destino: <strong>{selectedClient?.company_name || selectedClient?.contact_name || quote.client_name || 'Desconocido'}</strong>
                        </p>

                        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '1rem', border: `2px solid ${conversionType === 'order' ? '#0891B2' : '#E5E7EB'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: conversionType === 'order' ? '#ECFEFF' : 'white' }}>
                                <input type="radio" value="order" checked={conversionType === 'order'} onChange={() => setConversionType('order')} style={{ width: '20px', height: '20px' }} />
                                <div>
                                    <div style={{ fontWeight: '900', color: '#111827' }}>Pedido Único (Entrega Inmediata)</div>
                                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>Crea una orden de despacho estándar basada en esta cotización.</div>
                                </div>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '1rem', border: `2px solid ${conversionType === 'agreement' ? '#0891B2' : '#E5E7EB'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: conversionType === 'agreement' ? '#ECFEFF' : 'white' }}>
                                <input type="radio" value="agreement" checked={conversionType === 'agreement'} onChange={() => setConversionType('agreement')} style={{ width: '20px', height: '20px' }} />
                                <div>
                                    <div style={{ fontWeight: '900', color: '#111827' }}>Acuerdo Comercial (Bloqueo B2B)</div>
                                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>Congela los precios temporalmente sin generar un pedido aún.</div>
                                </div>
                            </label>
                        </div>

                        {conversionType === 'order' ? (
                            <div style={{ marginBottom: '1.5rem', backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Fecha de Entrega Deseada:</label>
                                <input 
                                    type="date" 
                                    value={deliveryDate} 
                                    onChange={e => setDeliveryDate(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', border: '1px solid #D1D5DB', borderRadius: '6px', fontWeight: 'bold' }}
                                />
                            </div>
                        ) : (
                            <div style={{ marginBottom: '1.5rem', backgroundColor: '#FFFBEB', padding: '1rem', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#92400E' }}>Validez del Acuerdo (Vencimiento):</label>
                                <input 
                                    type="date" 
                                    value={validUntilDate} 
                                    onChange={e => setValidUntilDate(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', border: '1px solid #FCD34D', borderRadius: '6px', fontWeight: 'bold' }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowConversionModal(false)} style={{ padding: '0.8rem', background: 'none', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                            <button
                                onClick={submitConversion}
                                disabled={converting}
                                style={{ padding: '0.8rem 1.5rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {converting ? 'Procesando...' : (conversionType === 'order' ? '🚀 Crear Pedido' : '🤝 Activar Acuerdo')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
