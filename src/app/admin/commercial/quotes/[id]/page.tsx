'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function QuoteDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [quote, setQuote] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [converting, setConverting] = useState(false);

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

                // 2. Create Order Items
                const { error: iErr } = await supabase.from('order_items').insert(
                    items.map(qi => ({
                        order_id: order.id,
                        product_id: qi.product_id,
                        quantity: qi.quantity_estimated || 1,
                        unit_price: (qi.final_price || 0) * (1 + ((qi.iva_rate || 0) / 100)),
                        variant_label: '', // Podría sacarse del nombre si se desea
                        nickname: qi.product_name || (qi.products?.name || '')
                    }))
                );

                if (iErr) throw iErr;

                // 3. Update Quote Status
                await supabase
                    .from('quotes')
                    .update({ status: 'converted', client_id: selectedClient.id, order_id: order.id }) 
                    .eq('id', quote.id);

                alert('✅ ¡Pedido Creado Exitosamente!');
                router.push(`/admin/orders/${order.id}`); 

            } else {
                // Commercial Agreement Flow
                await supabase
                    .from('quotes')
                    .update({ 
                        status: 'agreement', 
                        client_id: selectedClient.id, 
                        valid_until: new Date(validUntilDate).toISOString(),
                        notes: (quote.notes || '') + '\n[CONVERTIDO A ACUERDO COMERCIAL]'
                    })
                    .eq('id', quote.id);
                
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

    if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
    if (!quote) return <div style={{ padding: '2rem' }}>Cotización no encontrada.</div>;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/commercial/quotes" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver</Link>
                </div>

                {/* HEADER CARD */}
                <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#6B7280', fontWeight: 'bold' }}>Cotización #{quote.quote_number || '---'}</div>
                        <h1 style={{ fontSize: '2rem', margin: '0.5rem 0', fontWeight: '900' }}>{quote.client_name}</h1>
                        <div style={{ display: 'flex', gap: '1rem', color: '#4B5563' }}>
                            <span>Modelo: <strong>{quote.model_snapshot_name}</strong></span>
                            <span>Fecha: {new Date(quote.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#059669' }}>${quote.total_amount?.toLocaleString()}</div>
                        <div style={{ marginBottom: '1rem' }}>Total Ofertado</div>

                        {quote.status === 'converted' ? (
                            <Link href={quote.order_id ? `/admin/orders/${quote.order_id}` : '/admin/orders'} style={{ textDecoration: 'none' }}>
                                <button style={{ backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #10B981', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    ✓ CONVERTIDA A PEDIDO
                                    <span style={{ fontSize: '0.8rem', textDecoration: 'underline' }}>Ver documento →</span>
                                </button>
                            </Link>
                        ) : quote.status === 'agreement' ? (
                            <button disabled style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #3B82F6', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🤝 ACUERDO COMERCIAL
                                <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>(Vigente)</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleConvertClick}
                                disabled={converting}
                                style={{ backgroundColor: '#111827', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
                            >
                                {converting ? 'Procesando...' : '🚀 Convertir a Pedido'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ITEMS TABLE */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>Producto</th>
                                <th style={{ padding: '1rem' }}>Cant</th>
                                <th style={{ padding: '1rem' }}>Costo Base</th>
                                <th style={{ padding: '1rem' }}>Margen</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>IVA</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Precio Unit.</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.products?.name || 'Producto'}</td>
                                    <td style={{ padding: '1rem' }}>{item.quantity_estimated} {item.unit || ''}</td>
                                    <td style={{ padding: '1rem', color: '#6B7280' }}>${item.base_cost?.toLocaleString()}</td>
                                    <td style={{ padding: '1rem', color: '#2563EB', fontWeight: 'bold' }}>{item.margin_applied}%</td>
                                    <td style={{ padding: '1rem', textAlign: 'center', color: '#6B7280', fontSize: '0.9rem' }}>{item.iva_rate || 0}%</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${item.final_price?.toLocaleString()}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${((item.quantity_estimated || 0) * (item.final_price || 0) * (1 + ((item.iva_rate || 0)/100)))?.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #E5E7EB' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>Subtotal antes de impuestos</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                    ${(quote?.subtotal_amount || items.reduce((sum, i) => sum + ((i.quantity_estimated || 0) * (i.final_price || 0)), 0)).toLocaleString()}
                                </td>
                            </tr>
                            <tr style={{ color: '#4B5563' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Impuestos</td>
                                <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                    ${(items.reduce((sum, i) => sum + ((i.quantity_estimated || 0) * (i.final_price || 0)) * ((i.iva_rate || 0) / 100), 0)).toLocaleString()}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#F9FAFB' }}>
                                <td colSpan={5}></td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900' }}>Total</td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '900', fontSize: '1.5rem', color: '#059669' }}>
                                    ${(quote?.total_amount || 0).toLocaleString()}
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
                            Para crear un pedido, esta cotización debe estar asignada a un usuario registrado en el sistema.
                        </p>

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
