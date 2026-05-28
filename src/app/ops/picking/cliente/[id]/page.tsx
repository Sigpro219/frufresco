'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { 
    ChevronLeft, 
    Check, 
    CheckCircle, 
    AlertTriangle, 
    XCircle, 
    X,
    Scale
} from 'lucide-react';

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
                    profiles:profile_id (
                        id, company_name, contact_name, role
                    ),
                    order_items (
                        id, quantity, picked_quantity, nickname, variant_label,
                        products (name, category, unit_of_measure)
                    )
                `)
                .eq('id', orderId)
                .single();

            if (error) throw error;

            const p = (order as any).profiles;
            let name = 'Cliente';
            if (p) {
                name = p.role === 'b2b_client' 
                    ? (p.company_name || 'Sin Razón Social') 
                    : (p.contact_name || p.company_name || 'Cliente B2C');
            }
            setClientName(name);
            
            const filteredItems = (order.order_items || [])
                .filter((item: any) => item.products?.category === category)
                .map((item: any) => {
                    const variant = item.variant_label || item.nickname || '';
                    const dispName = variant ? `${item.products?.name} (${variant})` : item.products?.name;
                    return {
                        id: item.id,
                        product_name: dispName,
                        category: item.products?.category,
                        unit_of_measure: item.products?.unit_of_measure,
                        quantity: item.quantity,
                        picked_quantity: item.picked_quantity || 0
                    };
                });
            
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
        <div style={{ backgroundColor: '#0A111C', minHeight: '100vh', color: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{ padding: '1.5rem', backgroundColor: '#121D2D', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#0D7A57', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                    <ChevronLeft size={24} strokeWidth={2.5} />
                </button>
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
                                backgroundColor: isDone ? 'rgba(13, 122, 87, 0.1)' : '#121D2D',
                                border: `1px solid ${isDone ? '#0D7A57' : 'rgba(255, 255, 255, 0.08)'}`,
                                borderRadius: '16px',
                                padding: '1.2rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                opacity: isDone ? 0.8 : 1,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease-in-out',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                            }}
                            className="item-card"
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>{item.product_name}</div>
                                <div style={{ fontSize: '0.9rem', color: '#9CA3AF', marginTop: '0.3rem' }}>
                                    Pedido: <span style={{ color: 'white', fontWeight: 'bold' }}>{item.quantity} {item.unit_of_measure}</span>
                                </div>
                                {item.picked_quantity > 0 && !isDone && (
                                    <div style={{ fontSize: '0.8rem', color: '#F59E0B', fontWeight: 'bold', marginTop: '0.3rem' }}>
                                        Llevas: {item.picked_quantity} {item.unit_of_measure}
                                    </div>
                                )}
                            </div>
                            
                            {isDone ? (
                                <div style={{ backgroundColor: '#0D7A57', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Check size={18} strokeWidth={3} />
                                </div>
                            ) : (
                                <button style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '12px', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    ALISTAR
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Picking Modal */}
            {selectedItem && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(10, 17, 28, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
                    <div style={{ backgroundColor: '#121D2D', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)', borderBottom: 'none', width: '100%', padding: '2rem 1.5rem', animation: 'slideUp 0.25s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Scale size={20} strokeWidth={2.5} className="text-slate-400" />
                                Alistando Producto
                            </h2>
                            <button onClick={() => setSelectedItem(null)} style={{ background: '#0A111C', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#9CA3AF', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ margin: 0, color: '#9CA3AF', marginBottom: '0.8rem', fontWeight: 'bold' }}>{selectedItem.product_name}</p>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94A3B8' }}>Cantidad Picada ({selectedItem.unit_of_measure})</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input 
                                    type="number" 
                                    value={pickedQty} 
                                    onChange={(e) => setPickedQty(e.target.value)}
                                    style={{ flex: 1, padding: '1rem', fontSize: '1.5rem', fontWeight: '900', borderRadius: '12px', border: '1px solid #0D7A57', backgroundColor: '#0A111C', color: 'white', outline: 'none' }} 
                                />
                                <button 
                                    onClick={() => setPickedQty(selectedItem.quantity.toString())}
                                    style={{ padding: '0 1.5rem', borderRadius: '12px', backgroundColor: '#0A111C', color: 'white', border: '1px solid rgba(255, 255, 255, 0.08)', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}>TODO</button>
                            </div>
                        </div>

                        {/* Semáforo Calidad */}
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.8rem', textAlign: 'center', fontSize: '0.9rem', color: '#94A3B8' }}>Certificación de Calidad</label>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                {[
                                    { id: 'green', icon: <CheckCircle size={24} strokeWidth={2} />, label: 'Excelente', color: '#0D7A57' },
                                    { id: 'yellow', icon: <AlertTriangle size={24} strokeWidth={2} />, label: 'Regular', color: '#F59E0B' },
                                    { id: 'red', icon: <XCircle size={24} strokeWidth={2} />, label: 'No Despachar', color: '#EF4444' }
                                ].map(q => (
                                    <button
                                        key={q.id}
                                        onClick={() => setQuality(q.id as any)}
                                        style={{
                                            flex: 1, padding: '1rem 0.5rem', borderRadius: '12px',
                                            backgroundColor: quality === q.id ? q.color : '#0A111C',
                                            border: '1px solid rgba(255, 255, 255, 0.08)', color: 'white',
                                            transition: 'all 0.2s', scale: quality === q.id ? '1.05' : '1',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '6px',
                                            justifyContent: 'center',
                                            boxShadow: quality === q.id ? `0 10px 15px -3px ${q.color}40` : 'none'
                                        }}
                                    >
                                        <div>{q.icon}</div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 'bold' }}>{q.label.toUpperCase()}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            disabled={processing || !pickedQty || !quality}
                            onClick={handleSave}
                            style={{ 
                                width: '100%', padding: '1.2rem', borderRadius: '16px', backgroundColor: '#0D7A57', 
                                color: 'white', border: 'none', fontWeight: '900', fontSize: '1.1rem',
                                opacity: (processing || !pickedQty || !quality) ? 0.5 : 1,
                                cursor: (processing || !pickedQty || !quality) ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s'
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
                .item-card:hover {
                    border-color: rgba(13, 122, 87, 0.4) !important;
                    transform: translateY(-2px);
                }
            `}</style>
        </div>
    );
}

export default function PickingClientDetail() {
    return (
        <Suspense fallback={
            <div style={{ backgroundColor: '#0A111C', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#0D7A57', fontWeight: 'bold' }}>Cargando detalles de alistamiento...</div>
            </div>
        }>
            <PickingClientContent />
        </Suspense>
    );
}
