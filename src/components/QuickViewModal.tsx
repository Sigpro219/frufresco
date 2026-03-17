'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../lib/cartContext';
import { useRouter } from 'next/navigation';

// Keep interface consistent with usage
interface Product {
    id: string;
    name: string;
    base_price: number;
    unit_of_measure: string;
    image_url: string;
    sku?: string;
    options?: any;
    options_config?: any[];
    variants?: any[];
}

interface QuickViewModalProps {
    product: Product;
    onClose: () => void;
}

const ModalContent: React.FC<QuickViewModalProps> = ({ product, onClose }) => {
    const { addItem } = useCart();
    const router = useRouter();
    const [quantity, setQuantity] = useState(1);

    // Normalizar las opciones
    const displayOptions = product.options_config && product.options_config.length > 0
        ? product.options_config.reduce((acc, opt) => ({ ...acc, [opt.name]: opt.values }), {})
        : product.options || {};

    const initialSelections: Record<string, string> = {};
    Object.entries(displayOptions).forEach(([key, values]: [string, any]) => {
        if (Array.isArray(values) && values.length > 0) {
            initialSelections[key] = values[0];
        }
    });

    const [selections, setSelections] = useState(initialSelections);

    const visibleVariants = (product.variants || []).filter(v => v.show_on_web !== false);

    const currentVariant = visibleVariants.find(v =>
        Object.entries(selections).every(([key, value]) => v.options[key] === value)
    );

    const isAvailable = product.variants && product.variants.length > 0 ? !!currentVariant : true;
    const currentPrice = currentVariant ? currentVariant.price : product.base_price;

    const getFormattedName = () => {
        const optionString = Object.entries(selections)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        return optionString ? `${product.name} (${optionString})` : product.name;
    };

    const handleAddToCart = () => {
        addItem({
            id: product.id,
            name: getFormattedName(),
            price: currentPrice,
            quantity: quantity,
            image_url: product.image_url
        });
        onClose();
    };

    const handleBuyNow = () => {
        handleAddToCart();
        router.push('/checkout');
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                padding: '2rem',
                width: '90%',
                maxWidth: '480px',
                position: 'relative',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                animation: 'modalFadeUp 0.3s ease-out'
            }}>
                <style jsx>{`
                    @keyframes modalFadeUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1.25rem',
                        right: '1.25rem',
                        background: '#F3F4F6',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#6B7280',
                        fontSize: '1rem',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                >
                    ✕
                </button>

                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{
                        width: '140px',
                        height: '140px',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        backgroundColor: '#F9FAFB',
                        border: '1px solid #F3F4F6'
                    }}>
                        <img
                            src={product.image_url}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => (e.currentTarget.src = 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=400')}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: '0 0 0.5rem', color: '#111827' }}>{product.name}</h2>
                        <span style={{ 
                            display: 'inline-block',
                            backgroundColor: '#F3F4F6', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            fontWeight: '600', 
                            color: '#6B7280',
                            marginBottom: '0.75rem'
                        }}>SKU: {product.sku || 'N/A'}</span>
                        <p style={{
                            fontSize: '1.75rem',
                            fontWeight: '900',
                            color: 'var(--primary)',
                            margin: 0
                        }}>
                            ${(currentPrice || 0).toLocaleString('es-CO')}
                            <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: '500' }}> / {product.unit_of_measure}</span>
                        </p>
                    </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#F3F4F6', margin: '1.5rem 0' }}></div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1.5rem', paddingRight: '0.5rem' }}>
                    {Object.entries(displayOptions).map(([optionName, values]: [string, any]) => (
                        <div key={optionName} style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.6rem', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', color: '#9CA3AF' }}>
                                {optionName}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                {Array.isArray(values) && values.map((val) => (
                                    <button
                                        key={val}
                                        onClick={() => setSelections({ ...selections, [optionName]: val })}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '10px',
                                            border: selections[optionName] === val ? '2px solid var(--primary)' : '1px solid #E5E7EB',
                                            backgroundColor: selections[optionName] === val ? 'var(--primary)' : 'white',
                                            color: selections[optionName] === val ? 'white' : '#4B5563',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.75rem', color: '#6B7280', textTransform: 'uppercase' }}>
                        Seleccionar Cantidad
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            border: '1.5px solid #F3F4F6', 
                            borderRadius: '12px', 
                            overflow: 'hidden',
                            backgroundColor: '#F9FAFB'
                        }}>
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                style={{
                                    width: '44px', height: '44px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '1.2rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    color: '#4B5563',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >−</button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                style={{
                                    width: '60px',
                                    textAlign: 'center',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '1.1rem',
                                    fontWeight: '800',
                                    color: '#111827',
                                    outline: 'none'
                                }}
                            />
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                style={{
                                    width: '44px', height: '44px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    fontSize: '1.2rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    color: '#4B5563',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >+</button>
                        </div>
                        <div style={{ flex: 1, textAlign: 'right' }}>
                             <span style={{ fontSize: '0.9rem', color: '#9CA3AF', fontWeight: '600' }}>TOTAL</span>
                             <div style={{ fontSize: '1.35rem', fontWeight: '900', color: isAvailable ? '#111827' : '#9CA3AF' }}>
                                 ${(currentPrice * (isAvailable ? quantity : 1)).toLocaleString('es-CO')}
                             </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {!isAvailable && (
                        <div style={{ 
                            backgroundColor: '#FEF2F2', 
                            color: '#EF4444', 
                            padding: '0.75rem', 
                            borderRadius: '10px', 
                            fontSize: '0.85rem', 
                            fontWeight: '700', 
                            textAlign: 'center',
                            border: '1px solid #FEE2E2',
                            marginBottom: '0.5rem'
                        }}>
                            ⚠️ Combinación no disponible actualmente
                        </div>
                    )}
                    <button
                        onClick={handleAddToCart}
                        disabled={!isAvailable}
                        style={{
                            width: '100%',
                            padding: '1.15rem',
                            backgroundColor: 'white',
                            border: `2.5px solid ${isAvailable ? 'var(--primary)' : '#E5E7EB'}`,
                            color: isAvailable ? 'var(--primary)' : '#9CA3AF',
                            borderRadius: '15px',
                            fontSize: '1rem',
                            fontWeight: '800',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }}
                        onMouseEnter={(e) => {
                            if(isAvailable) {
                                e.currentTarget.style.transform = 'scale(1.02)';
                                e.currentTarget.style.backgroundColor = 'rgba(26, 77, 46, 0.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if(isAvailable) {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.backgroundColor = 'white';
                            }
                        }}
                    >
                        {isAvailable ? 'Agregar al Pedido' : 'No disponible'}
                    </button>
                    <button
                        onClick={handleBuyNow}
                        disabled={!isAvailable}
                        style={{
                            width: '100%',
                            padding: '1.15rem',
                            borderRadius: '15px',
                            fontSize: '1rem',
                            fontWeight: '800',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            backgroundColor: isAvailable ? 'var(--primary)' : '#F3F4F6',
                            color: isAvailable ? 'white' : '#9CA3AF',
                            border: 'none',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            boxShadow: isAvailable ? '0 10px 20px rgba(26, 77, 46, 0.2)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                            if(isAvailable) {
                                e.currentTarget.style.transform = 'scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 15px 30px rgba(26, 77, 46, 0.3)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if(isAvailable) {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.boxShadow = '0 10px 20px rgba(26, 77, 46, 0.2)';
                            }
                        }}
                    >
                        {isAvailable ? 'Pagar Ahora' : 'Agotado'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const QuickViewModal: React.FC<QuickViewModalProps> = (props) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow || 'unset';
        };
    }, []);

    if (!mounted) return null;

    return createPortal(
        <ModalContent {...props} />,
        document.body
    );
};

export default QuickViewModal;
