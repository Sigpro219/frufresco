'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cartContext';
import { 
    ShoppingCart, 
    Package, 
    Scale, 
    ArrowRight, 
    ArrowDown, 
    ChevronDown, 
    ChevronUp,
    Sparkles
} from 'lucide-react';

export default function FloatingCartBar() {
    const { items, totalPrice, totalWeight } = useCart();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [animateBump, setAnimateBump] = useState(false);
    const prevCountRef = useRef(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Pulse animation when items change
    useEffect(() => {
        if (!mounted) return;
        if (items.length !== prevCountRef.current) {
            setAnimateBump(true);
            const timer = setTimeout(() => setAnimateBump(false), 400);
            prevCountRef.current = items.length;
            // Auto expand if user minimized but adds a new product
            if (isMinimized && items.length > 0) {
                setIsMinimized(false);
            }
            return () => clearTimeout(timer);
        }
    }, [items.length, mounted, isMinimized]);

    // Don't render on admin, ops or print pages
    const isOpsOrAdmin = pathname?.startsWith('/ops') || pathname?.startsWith('/admin') || pathname?.includes('/print');
    const isCheckout = pathname === '/checkout';

    if (!mounted || isOpsOrAdmin || items.length === 0) {
        return null;
    }

    const formattedWeight = parseFloat(totalWeight.toFixed(2)).toString().replace('.', ',');
    const formattedPrice = `$${totalPrice.toLocaleString('es-CO')}`;

    const handleScrollToPayment = () => {
        const paymentSection = document.getElementById('payment-method-section') || document.getElementById('confirm-order-btn');
        if (paymentSection) {
            paymentSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
    };

    return (
        <aside 
            aria-label="Resumen flotante de carrito de compra"
            style={{
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 990,
                width: 'calc(100% - 32px)',
                maxWidth: isMinimized ? 'auto' : '680px',
                pointerEvents: 'none',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
        >
            <div 
                style={{
                    pointerEvents: 'auto',
                    backgroundColor: 'rgba(6, 78, 59, 0.95)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1.5px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: isMinimized ? '999px' : '24px',
                    boxShadow: '0 20px 40px -10px rgba(6, 78, 59, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.2)',
                    padding: isMinimized ? '8px 18px' : '10px 14px 10px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    color: 'white',
                    transform: animateBump ? 'scale(1.02)' : 'scale(1)',
                    transition: 'transform 0.2s ease, padding 0.3s ease, border-radius 0.3s ease'
                }}
            >
                {isMinimized ? (
                    // MINIMIZED FLOATING PILL
                    <div 
                        onClick={() => setIsMinimized(false)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                        title="Click para expandir el resumen del pedido"
                    >
                        <div style={{
                            backgroundColor: '#059669',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                        }}>
                            <ShoppingCart size={16} color="#FFFFFF" strokeWidth={2.5} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: '800' }}>
                            <span>{items.length} {items.length === 1 ? 'ref' : 'refs'}</span>
                            <span style={{ opacity: 0.4 }}>•</span>
                            <span style={{ color: '#A7F3D0' }}>{formattedWeight} Kg</span>
                            <span style={{ opacity: 0.4 }}>•</span>
                            <span style={{ color: '#FDE047' }}>{formattedPrice}</span>
                        </div>
                        <ChevronUp size={16} style={{ color: '#A7F3D0', marginLeft: '4px' }} />
                    </div>
                ) : (
                    // FULL EXPANDED SUMMARY BAR
                    <>
                        {/* Summary Metrics */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            {/* Shopping Icon */}
                            <div style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                width: '38px',
                                height: '38px',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                flexShrink: 0
                            }}>
                                <ShoppingCart size={18} color="#6EE7B7" strokeWidth={2.5} />
                            </div>

                            {/* 1. Referencias Únicas */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{
                                    fontSize: '0.62rem',
                                    color: '#A7F3D0',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}>
                                    <Package size={10} strokeWidth={2.5} /> Refs. Únicas
                                </span>
                                <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#FFFFFF', lineHeight: '1.2' }}>
                                    {items.length} {items.length === 1 ? 'referencia' : 'referencias'}
                                </span>
                            </div>

                            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.18)' }} />

                            {/* 2. Peso Total */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{
                                    fontSize: '0.62rem',
                                    color: '#A7F3D0',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}>
                                    <Scale size={10} strokeWidth={2.5} /> Peso Total
                                </span>
                                <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#6EE7B7', lineHeight: '1.2' }}>
                                    {formattedWeight} Kg
                                </span>
                            </div>

                            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.18)' }} />

                            {/* 3. Total Estimado */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{
                                    fontSize: '0.62rem',
                                    color: '#FDE047',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}>
                                    <Sparkles size={10} strokeWidth={2.5} /> Total Estimado
                                </span>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#FDE047', lineHeight: '1.2' }}>
                                    {formattedPrice}
                                </span>
                            </div>
                        </div>

                        {/* Actions Right */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {isCheckout ? (
                                <button
                                    type="button"
                                    onClick={handleScrollToPayment}
                                    style={{
                                        backgroundColor: '#10B981',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '14px',
                                        fontSize: '0.85rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#10B981')}
                                    title="Desplazarse suavemente al método de pago y confirmación de entrega"
                                >
                                    <span>Ir al Pago</span>
                                    <ArrowDown size={15} strokeWidth={2.5} />
                                </button>
                            ) : (
                                <Link href="/checkout" style={{ textDecoration: 'none' }}>
                                    <button
                                        type="button"
                                        style={{
                                            backgroundColor: '#10B981',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            padding: '8px 18px',
                                            borderRadius: '14px',
                                            fontSize: '0.85rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#10B981')}
                                    >
                                        <span>Pagar</span>
                                        <ArrowRight size={15} strokeWidth={2.5} />
                                    </button>
                                </Link>
                            )}

                            {/* Collapse Button */}
                            <button
                                type="button"
                                onClick={() => setIsMinimized(true)}
                                style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    color: '#A7F3D0',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
                                title="Minimizar barra flotante"
                            >
                                <ChevronDown size={16} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}
