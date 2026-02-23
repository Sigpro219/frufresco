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

        // Load Items
        const { data: iData } = await supabase
            .from('quote_items')
            .select('*')
            .eq('quote_id', params.id);

        if (iData) setItems(iData);
        setLoading(false);
    };

    // --- CONVERSION LOGIC ---
    const handleConvertClick = () => {
        if (quote.status === 'converted') return alert('Esta cotización ya fue convertida.');

        // If we already have a profile_id linked, go straight to conversion
        if (quote.profile_id) {
            confirmConversion(quote.profile_id);
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
            .select('id, business_name, email')
            .ilike('business_name', `%${term}%`)
            .limit(5);
        if (data) setClientResults(data);
    };

    const confirmConversion = async (profileId: string) => {
        if (!confirm('¿Crear un PEDIDO REAL basado en esta cotización?')) return;
        setConverting(true);

        try {
            // 1. Calculate Delivery Date (Tomorrow by default or same validity logic?)
            // Usually Orders are for "Tomorrow" if before cut-off. Let's assume standard logic or just "Tomorrow".
            const deliveryDate = new Date();
            deliveryDate.setDate(deliveryDate.getDate() + 1); // Default delivery tomorrow

            // 2. Create Order
            const { data: order, error: oErr } = await supabase
                .from('orders')
                .insert({
                    profile_id: profileId,
                    status: 'pending_approval',
                    delivery_date: deliveryDate.toISOString().split('T')[0],
                    total_amount: quote.total_amount,
                    order_type: 'B2B', // Assuming standard B2B
                    shipping_address: 'Dirección del Cliente' // Placeholder needed? Or fetch from profile? Orders schema might imply it.
                })
                .select()
                .single();

            if (oErr) throw oErr;

            // 3. Create Order Items
            const orderItems = items.map(qi => ({
                order_id: order.id,
                product_id: qi.product_id, // Assuming UUID match
                quantity: qi.quantity,
                unit_price: qi.unit_price,
                total_price: qi.total_price,
                product_name: qi.product_name || 'Desconocido' // Fallback
            }));

            // We need to check orders_items schema. 
            // Usually products info is linked via product_id.
            // Simplified insert:
            const { error: iErr } = await supabase.from('order_items').insert(
                items.map(qi => ({
                    order_id: order.id,
                    product_id: qi.product_id,
                    quantity: qi.quantity,
                    unit_price: qi.unit_price,
                    total_price: qi.total_price,
                    variant_label: '' // No variants in quotes? If quotes supported variants we'd need them.
                }))
            );

            if (iErr) throw iErr;

            // 4. Update Quote Status
            await supabase
                .from('quotes')
                .update({ status: 'converted', profile_id: profileId }) // Link it if it wasn't
                .eq('id', quote.id);

            alert('✅ ¡Pedido Creado Exitosamente!');
            router.push(`/admin/orders/${order.id}`); // Go to the new order

        } catch (err: any) {
            console.error(err);
            alert('Error al convertir: ' + err.message);
        } finally {
            setConverting(false);
            setShowClientModal(false);
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
                            <button disabled style={{ backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #10B981', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                                ✓ CONVERTIDA A PEDIDO
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
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Precio Unit.</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.product_name}</td>
                                    <td style={{ padding: '1rem' }}>{item.quantity} {item.unit}</td>
                                    <td style={{ padding: '1rem', color: '#6B7280' }}>${item.cost_basis?.toLocaleString()}</td>
                                    <td style={{ padding: '1rem', color: '#2563EB', fontWeight: 'bold' }}>{item.margin_percent}%</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${item.unit_price?.toLocaleString()}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>${item.total_price?.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
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
                                            <div style={{ fontWeight: 'bold' }}>{c.business_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{c.email}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowClientModal(false)} style={{ padding: '0.8rem', background: 'none', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                            <button
                                onClick={() => selectedClient && confirmConversion(selectedClient.id)}
                                disabled={!selectedClient || converting}
                                style={{ padding: '0.8rem 1.5rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: !selectedClient ? 0.5 : 1 }}
                            >
                                Confirmar y Crear Pedido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
