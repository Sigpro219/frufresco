'use client';

import { useState } from 'react';
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
    options_config?: any[];
    variants?: any[];
}

interface QuickViewModalProps {
    product: Product;
    onClose: () => void;
}

const QuickViewModal: React.FC<QuickViewModalProps> = ({ product, onClose }) => {
    const { addItem } = useCart();
    const router = useRouter();
    const [quantity, setQuantity] = useState(1);

    // Normalizar las opciones (viniendo de options o de options_config del Admin)
    const displayOptions = product.options_config && product.options_config.length > 0
        ? product.options_config.reduce((acc, opt) => ({ ...acc, [opt.name]: opt.values }), {})
        : product.options || {};

    // Initialize selections with the first option of each category
    const initialSelections: Record<string, string> = {};
    Object.entries(displayOptions).forEach(([key, values]: [string, any]) => {
        if (Array.isArray(values) && values.length > 0) {
            initialSelections[key] = values[0];
        }
    });

    const [selections, setSelections] = useState(initialSelections);

    // Calcular el precio actual basado en la variante seleccionada
    const currentVariant = product.variants?.find(v =>
        Object.entries(selections).every(([key, value]) => v.options[key] === value)
    );

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

        // Visual feedback could be added here (toast)
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
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999, // High z-index to sit on top of everything
                backdropFilter: 'blur(4px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '2rem',
                width: '90%',
                maxWidth: '450px',
                position: 'relative',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'none',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: '#6B7280'
                    }}
                >
                    ✕
                </button>

                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        backgroundColor: '#F3F4F6'
                    }}>
                        <img
                            src={product.image_url}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 0.5rem' }}>{product.name}</h2>
                        <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>SKU: {product.sku || 'N/A'}</p>
                        <p style={{
                            fontSize: '1.5rem',
                            fontWeight: '800',
                            color: 'var(--primary-dark)',
                            marginTop: '0.5rem'
                        }}>
                            ${product.base_price.toLocaleString('es-CO')}
                            <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: '400' }}> / {product.unit_of_measure}</span>
                        </p>
                    </div>
                </div>

                {/* Separator */}
                <div style={{ height: '1px', backgroundColor: '#E5E7EB', margin: '1rem 0' }}></div>

                {/* Variants */}
                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
                    {Object.entries(displayOptions).map(([optionName, values]: [string, any]) => (
                        <div key={optionName} style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.5rem', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', color: '#6B7280' }}>
                                {optionName}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {Array.isArray(values) && values.map((val) => (
                                    <button
                                        key={val}
                                        onClick={() => setSelections({ ...selections, [optionName]: val })}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '6px',
                                            border: selections[optionName] === val ? '2px solid black' : '1px solid #E5E7EB',
                                            backgroundColor: selections[optionName] === val ? 'black' : 'white',
                                            color: selections[optionName] === val ? 'white' : '#374151',
                                            fontWeight: '600',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Quantity */}
                <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                        Cantidad ({product.unit_of_measure})
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            style={{
                                width: '40px', height: '40px',
                                borderRadius: '8px',
                                border: '1px solid #D1D5DB',
                                backgroundColor: 'white',
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >−</button>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{
                                width: '80px',
                                textAlign: 'center',
                                padding: '0.5rem',
                                fontSize: '1.1rem',
                                border: '1px solid #D1D5DB',
                                borderRadius: '8px',
                                fontWeight: '600'
                            }}
                        />
                        <button
                            onClick={() => setQuantity(quantity + 1)}
                            style={{
                                width: '40px', height: '40px',
                                borderRadius: '8px',
                                border: '1px solid var(--primary)',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >+</button>
                    </div>
                </div>

                {/* Total Price */}
                <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
                    <span style={{ fontSize: '1rem', color: '#6B7280', marginRight: '0.5rem' }}>Total:</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary-dark)' }}>
                        ${(currentPrice * quantity).toLocaleString('es-CO')}
                    </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button
                        onClick={handleAddToCart}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            backgroundColor: 'white',
                            border: '2px solid var(--primary)',
                            color: 'var(--primary)',
                            borderRadius: '12px',
                            fontSize: '1rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Agregar al Carrito
                    </button>
                    <button
                        onClick={handleBuyNow}
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            padding: '1rem',
                            borderRadius: '12px',
                            fontSize: '1rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                        }}
                    >
                        Comprar Ahora
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickViewModal;
