'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';

interface ProductItem {
    id: string; // order_item_id
    product_name: string;
    category: string;
    unit_of_measure: string;
    quantity: number;
    picked_quantity: number;
    notes?: string;
}

function PickingClientContent() {
    const { id: orderId } = useParams();
    const searchParams = useSearchParams();
    const category = searchParams.get('category');
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<ProductItem[]>([]);
    const [clientName, setClientName] = useState('');
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
    
    // Form State
    const [pickedQty, setPickedQty] = useState<string>('');
    const [quality, setQuality] = useState<'green' | 'yellow' | 'red' | null>(null);
    const [processing, setProcessing] = useState(false);

    const router = useRouter();

    useEffect(() => {
        if (orderId) fetchData();
    }, [orderId, category]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: order, error } = await supabase
                .from('orders')
                .select(`
                    customer_name,
                    order_items (
                        id, quantity, picked_quantity,
                        products (name, category, unit_of_measure)
                    )
                `)
                .eq('id', orderId)
                .single();

            if (error) throw error;

            setClientName(order.customer_name);
            
            const filteredItems = (order.order_items || [])
                .filter((item: any) => item.products?.category === category)
                .map((item: any) => ({
                    id: item.id,
                    product_name: item.products?.name,
                    category: item.products?.category,
                    unit_of_measure: item.products?.unit_of_measure,
                    quantity: item.quantity,
                    picked_quantity: item.picked_quantity || 0
                }));
            
            setItems(filteredItems);
        } catch (err) {
            if (isAbortError(err)) return;
            console.error('Error in fetchData:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedItem || !pickedQty || !quality) return;
        setProcessing(true);

        try {
            const qty = parseFloat(pickedQty);
            const { error } = await supabase
                .from('order_items')
                .update({
                    picked_quantity: qty,
                    // If your DB supports these columns:
                    // quality_status: quality,
                    // picked_at: new Date().toISOString()
                })
                .eq('id', selectedItem.id);

            if (error) throw error;

            setSelectedItem(null);
            fetchData();
        } catch (err) {
            alert('Error al guardar: ' + (err as any).message);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div style={{ backgroundColor: '#111827', minHeight: '100vh', color: 'white', fontFamily: 'system-ui' }}>
            {/* Header */}
            <div style={{ padding: '1.5rem', backgroundColor: '#1F2937', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid #374151' }}>
                <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#10B981', fontSize: '1.5rem', cursor: 'pointer' }}>❮</button>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900' }}>{clientName}</h1>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>Célula: {category}</p>
                </div>
            </div>

            {/* List */}
            <div style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
                {items.map(item => {
                    const isDone = item.picked_quantity >= item.quantity;
                    return (
                        <div 
                            key={item.id}
                            onClick={() => {
                                setSelectedItem(item);
                                setPickedQty(item.quantity.toString());
                                setQuality(null);
                            }}
                            style={{
                                backgroundColor: isDone ? 'rgba(16, 185, 129, 0.1)' : '#1F2937',
                                border: `1px solid ${isDone ? '#10B981' : '#374151'}`,
                                borderRadius: '16px',
                                padding: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                opacity: isDone ? 0.8 : 1
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>{item.product_name}</div>
                                <div style={{ fontSize: '0.9rem', color: '#9CA3AF', marginTop: '0.2rem' }}>
                                    Pedido: <span style={{ color: 'white', fontWeight: 'bold' }}>{item.quantity} {item.unit_of_measure}</span>
                                </div>
                                {item.picked_quantity > 0 && !isDone && (
                                    <div style={{ fontSize: '0.8rem', color: '#F59E0B', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                        Llevas: {item.picked_quantity} {item.unit_of_measure}
                                    </div>
                                )}
                            </div>
                            
                            {isDone ? (
                                <div style={{ backgroundColor: '#10B981', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✓</div>
                            ) : (
                                <button style={{ backgroundColor: '#10B981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold' }}>ALISTAR</button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Picking Modal */}
            {selectedItem && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
                    <div style={{ backgroundColor: '#1F2937', width: '100%', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '2rem', animation: 'slideUp 0.3s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Alistando Producto</h2>
                            <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '1.5rem' }}>✕</button>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ margin: 0, color: '#9CA3AF', marginBottom: '0.5rem' }}>{selectedItem.product_name}</p>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Cantidad Picada ({selectedItem.unit_of_measure})</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input 
                                    type="number" 
                                    value={pickedQty} 
                                    onChange={(e) => setPickedQty(e.target.value)}
                                    style={{ flex: 1, padding: '1rem', fontSize: '1.5rem', fontWeight: '900', borderRadius: '12px', border: '2px solid #10B981', backgroundColor: '#111827', color: 'white' }} 
                                />
                                <button 
                                    onClick={() => setPickedQty(selectedItem.quantity.toString())}
                                    style={{ padding: '0 1rem', borderRadius: '12px', backgroundColor: '#374151', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '0.8rem' }}>TODO</button>
                            </div>
                        </div>

                        {/* Semáforo Calidad */}
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.8rem', textAlign: 'center' }}>Certificación de Calidad</label>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                {[
                                    { id: 'green', icon: '✅', label: 'Excelente', color: '#10B981' },
                                    { id: 'yellow', icon: '⚠️', label: 'Regular', color: '#F59E0B' },
                                    { id: 'red', icon: '❌', label: 'No Despachar', color: '#EF4444' }
                                ].map(q => (
                                    <button
                                        key={q.id}
                                        onClick={() => setQuality(q.id as any)}
                                        style={{
                                            flex: 1, padding: '1rem 0.5rem', borderRadius: '12px',
                                            backgroundColor: quality === q.id ? q.color : '#374151',
                                            border: 'none', color: 'white',
                                            transition: 'all 0.2s', scale: quality === q.id ? '1.05' : '1'
                                        }}
                                    >
                                        <div style={{ fontSize: '1.5rem' }}>{q.icon}</div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 'bold', marginTop: '0.2rem' }}>{q.label.toUpperCase()}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            disabled={processing || !pickedQty || !quality}
                            onClick={handleSave}
                            style={{ 
                                width: '100%', padding: '1.2rem', borderRadius: '16px', backgroundColor: '#10B981', 
                                color: 'white', border: 'none', fontWeight: '900', fontSize: '1.1rem',
                                opacity: (processing || !pickedQty || !quality) ? 0.5 : 1
                            }}>
                            {processing ? 'Guardando...' : 'CONFIRMAR ALISTAMIENTO'}
                        </button>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

export default function PickingClientDetail() {
    return (
        <Suspense fallback={
            <div style={{ backgroundColor: '#111827', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#10B981', fontWeight: 'bold' }}>Cargando detalles de alistamiento...</div>
            </div>
        }>
            <PickingClientContent />
        </Suspense>
    );
}
