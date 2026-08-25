'use client';

import { useState, useEffect } from 'react';
import { useCart } from '../lib/cartContext';
import { ShoppingCart, RotateCcw, Sparkles, X, Loader2, Calendar, CheckCircle2, ChevronRight, History } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ReorderHeroBanner() {
    const { addItem } = useCart();
    const router = useRouter();

    const [savedName, setSavedName] = useState('');
    const [savedPhone, setSavedPhone] = useState('');
    const [savedEmail, setSavedEmail] = useState('');
    const [savedId, setSavedId] = useState('');
    const [isMounted, setIsMounted] = useState(false);

    const [loading, setLoading] = useState(false);
    const [showRecentModal, setShowRecentModal] = useState(false);
    const [showLookupModal, setShowLookupModal] = useState(false);
    const [lookupInput, setLookupInput] = useState('');
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== 'undefined') {
            const name = localStorage.getItem('checkout_name') || '';
            const phone = localStorage.getItem('checkout_phone') || '';
            const email = localStorage.getItem('checkout_email') || '';
            const id = localStorage.getItem('checkout_identification') || '';

            if (name && (phone || email || id)) {
                // Get clean first name
                const firstName = name.split(' ')[0];
                setSavedName(firstName);
                setSavedPhone(phone);
                setSavedEmail(email);
                setSavedId(id);
            }
        }
    }, []);

    const handleQuickReorder = async (targetOrderId?: string) => {
        setLoading(true);
        setFeedbackMsg(null);
        try {
            const queryParams = new URLSearchParams();
            if (savedEmail) queryParams.set('email', savedEmail);
            if (savedPhone) queryParams.set('phone', savedPhone);
            if (savedId) queryParams.set('identification', savedId);
            if (targetOrderId) queryParams.set('target_order_id', targetOrderId);

            const res = await fetch(`/api/orders/last-purchase?${queryParams.toString()}`);
            const data = await res.json();

            if (!res.ok) {
                setFeedbackMsg({ text: data.error || 'No pudimos cargar tu pedido anterior.', type: 'error' });
                return;
            }

            if (!data.items || data.items.length === 0) {
                setFeedbackMsg({ text: 'Los productos de tu compra anterior no están disponibles en el catálogo de hoy.', type: 'error' });
                return;
            }

            let count = 0;
            for (const item of data.items) {
                addItem(item);
                count++;
            }

            if (data.recent_orders) {
                setRecentOrders(data.recent_orders);
            }

            setFeedbackMsg({
                text: `🎉 ¡Se cargaron ${count} productos de tu mercado al carrito con los precios de HOY!`,
                type: 'success'
            });

            if (showRecentModal) setShowRecentModal(false);

            // Redirect to checkout after 1.2s or let them view cart
            setTimeout(() => {
                router.push('/checkout');
            }, 1200);

        } catch (err: any) {
            console.error('Error in quick reorder:', err);
            setFeedbackMsg({ text: 'Error de conexión al cargar el pedido.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleLookupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lookupInput.trim()) return;

        setLoading(true);
        setFeedbackMsg(null);
        try {
            const clean = lookupInput.trim();
            const queryParams = new URLSearchParams();
            if (clean.includes('@')) queryParams.set('email', clean);
            else if (clean.length === 10) queryParams.set('phone', clean);
            else queryParams.set('identification', clean);

            const res = await fetch(`/api/orders/last-purchase?${queryParams.toString()}`);
            const data = await res.json();

            if (!res.ok) {
                setFeedbackMsg({ text: data.error || 'No encontramos compras asociadas a estos datos.', type: 'error' });
                return;
            }

            if (data.recent_orders && data.recent_orders.length > 0) {
                setRecentOrders(data.recent_orders);
                setShowLookupModal(false);
                setShowRecentModal(true);
            } else if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                    addItem(item);
                }
                setShowLookupModal(false);
                router.push('/checkout');
            }
        } catch (err) {
            setFeedbackMsg({ text: 'Error al buscar pedidos.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleOpenRecent = async () => {
        setShowRecentModal(true);
        if (recentOrders.length === 0 && (savedPhone || savedEmail || savedId)) {
            setLoading(true);
            try {
                const queryParams = new URLSearchParams();
                if (savedEmail) queryParams.set('email', savedEmail);
                if (savedPhone) queryParams.set('phone', savedPhone);
                if (savedId) queryParams.set('identification', savedId);

                const res = await fetch(`/api/orders/last-purchase?${queryParams.toString()}`);
                const data = await res.json();
                if (data.recent_orders) {
                    setRecentOrders(data.recent_orders);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
    };

    if (!isMounted) return null;

    return (
        <>
            {savedName ? (
                <div style={{
                    marginTop: '1.25rem',
                    marginBottom: '1rem',
                    padding: '1rem 1.25rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '20px',
                    border: '1.5px solid #A7F3D0',
                    boxShadow: '0 8px 30px rgba(6, 78, 59, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    maxWidth: '850px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '14px',
                            backgroundColor: '#ECFDF5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#059669',
                            flexShrink: 0
                        }}>
                            <Sparkles size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.98rem', fontWeight: '900', color: '#064E3B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                ¡Hola {savedName}! ¿Quieres pedir tu mercado habitual?
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: '600' }}>
                                Carga tus productos frecuentes al carrito con los precios de hoy sin contraseñas.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => handleQuickReorder()}
                            disabled={loading}
                            style={{
                                backgroundColor: '#059669',
                                color: 'white',
                                padding: '0.65rem 1.25rem',
                                borderRadius: '12px',
                                border: 'none',
                                fontWeight: '800',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                            Repetir mi último pedido
                        </button>

                        <button
                            onClick={handleOpenRecent}
                            style={{
                                backgroundColor: '#F0FDF4',
                                color: '#047857',
                                padding: '0.65rem 1rem',
                                borderRadius: '12px',
                                border: '1px solid #A7F3D0',
                                fontWeight: '700',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <History size={15} /> Ver últimos pedidos
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ marginTop: '0.8rem', marginBottom: '0.5rem' }}>
                    <button
                        onClick={() => setShowLookupModal(true)}
                        style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            color: 'white',
                            padding: '0.5rem 1.1rem',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <RotateCcw size={14} /> ¿Ya eres cliente? Repetir mi pedido anterior
                    </button>
                </div>
            )}

            {/* Toast Feedback */}
            {feedbackMsg && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2rem',
                    zIndex: 9999,
                    backgroundColor: feedbackMsg.type === 'success' ? '#065F46' : '#991B1B',
                    color: 'white',
                    padding: '1rem 1.5rem',
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: '700',
                    fontSize: '0.88rem'
                }}>
                    {feedbackMsg.type === 'success' ? <CheckCircle2 size={20} /> : <X size={20} />}
                    {feedbackMsg.text}
                </div>
            )}

            {/* Modal: Micro-Historial de Recompra (Últimos 3 Pedidos) */}
            {showRecentModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        maxWidth: '520px',
                        width: '100%',
                        padding: '2rem',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <History size={22} color="#059669" />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#1E293B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                    Tus Compras Recientes
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowRecentModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4' }}>
                            Selecciona el mercado que deseas repetir. Los productos se añadirán a tu carrito con los <strong>precios actualizados de hoy</strong>.
                        </p>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <Loader2 size={32} className="animate-spin" color="#059669" />
                                <p style={{ marginTop: '8px', fontSize: '0.85rem', color: '#64748B' }}>Consultando tu historial...</p>
                            </div>
                        ) : recentOrders.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {recentOrders.map((ord, idx) => {
                                    const dateStr = new Date(ord.created_at).toLocaleDateString('es-CO', {
                                        weekday: 'short',
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                    });

                                    return (
                                        <div
                                            key={ord.id}
                                            style={{
                                                padding: '1rem 1.2rem',
                                                backgroundColor: '#F8FAFC',
                                                borderRadius: '16px',
                                                border: '1px solid #E2E8F0',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase' }}>
                                                    {idx === 0 ? '⭐ Tu Última Compra' : `Compra Anterior #${idx + 1}`}
                                                </div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1E293B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Calendar size={14} color="#64748B" /> {dateStr}
                                                </div>
                                                <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px' }}>
                                                    Total anterior: ${Number(ord.total || 0).toLocaleString('es-CO')} COP
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleQuickReorder(ord.id)}
                                                disabled={loading}
                                                style={{
                                                    backgroundColor: '#059669',
                                                    color: 'white',
                                                    padding: '0.55rem 1rem',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    fontWeight: '800',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.2)'
                                                }}
                                            >
                                                <ShoppingCart size={14} /> Repetir
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#F8FAFC', borderRadius: '14px' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
                                    No registramos compras anteriores en este dispositivo.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: Búsqueda rápida por Teléfono/Email para nuevo dispositivo */}
            {showLookupModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        maxWidth: '460px',
                        width: '100%',
                        padding: '2rem',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#1E293B', fontFamily: 'var(--font-outfit), sans-serif' }}>
                                🔄 Repetir Pedido Anterior
                            </h3>
                            <button
                                onClick={() => setShowLookupModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4' }}>
                            Ingresa tu <strong>WhatsApp, Correo o Cédula</strong> con el que realizaste tu última compra para cargar automáticamente tus productos frecuentes.
                        </p>

                        <form onSubmit={handleLookupSubmit}>
                            <input
                                type="text"
                                placeholder="Ej: 3167022898 o juan@correo.com"
                                value={lookupInput}
                                onChange={(e) => setLookupInput(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '12px',
                                    border: '1.5px solid #E2E8F0',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    marginBottom: '1rem',
                                    fontFamily: 'var(--font-outfit), sans-serif'
                                }}
                                required
                            />

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    backgroundColor: '#059669',
                                    color: 'white',
                                    padding: '0.85rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    fontWeight: '800',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                                Buscar y Cargar mi Mercado
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
