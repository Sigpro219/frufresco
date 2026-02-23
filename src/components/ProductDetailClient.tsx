'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/cartContext';
import Link from 'next/link';

import { useRouter } from 'next/navigation';

interface Product {
    id: string;
    name: string;
    base_price: number;
    unit_of_measure: string;
    image_url: string;
    description: string;
    options?: any;
    options_config?: any[];
    variants?: any[];
}

export default function ProductDetailClient({ product }: { product: Product }) {
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

    const handleAdd = () => {
        addItem({
            id: product.id,
            name: getFormattedName(),
            price: currentPrice,
            quantity: quantity,
            image_url: product.image_url
        });

        alert(`¡${product.name} añadido al carrito!`);
    };

    const handleBuyNow = () => {
        addItem({
            id: product.id,
            name: getFormattedName(),
            price: currentPrice,
            quantity: quantity,
            image_url: product.image_url
        });
        router.push('/checkout');
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
            {/* Breadcrumbs */}
            <nav style={{ marginBottom: '2rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Inicio</Link> /
                <span style={{ marginLeft: '0.5rem' }}>{product.name}</span>
            </nav>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '4rem', alignItems: 'start' }}>
                {/* Left: Image Container */}
                <div style={{
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-md)',
                    backgroundColor: '#f9f9f9',
                    aspectRatio: '1/1'
                }}>
                    <img
                        src={product.image_url || '/placeholder_produce.png'}
                        alt={product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>

                {/* Right: Product Info */}
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                        {product.name}
                    </h1>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-dark)', marginBottom: '1.5rem' }}>
                        ${currentPrice.toLocaleString('es-CO')}
                        <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: '0.5rem' }}>
                            por {product.unit_of_measure}
                        </span>
                    </div>

                    <div style={{ marginBottom: '2rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                        {product.description || 'Producto fresco de alta calidad seleccionado especialmente para ti.'}
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '2rem' }} />

                    {/* Dynamic Variant Selectors */}
                    {Object.entries(displayOptions).map(([optionName, values]: [string, any]) => (
                        <div key={optionName} style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                                {optionName}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                {Array.isArray(values) && values.map((val) => (
                                    <button
                                        key={val}
                                        onClick={() => setSelections({ ...selections, [optionName]: val })}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: 'var(--radius-md)',
                                            border: selections[optionName] === val ? '2px solid black' : '1px solid var(--border)',
                                            backgroundColor: selections[optionName] === val ? 'black' : 'white',
                                            color: selections[optionName] === val ? 'white' : 'var(--text-main)',
                                            fontWeight: '600',
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

                    {/* Quantity Section */}
                    <div style={{ marginBottom: '2.5rem' }}>
                        <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                            Cantidad
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid var(--border)', width: 'fit-content', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                style={{ width: '40px', height: '40px', border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                                −
                            </button>
                            <span style={{ width: '40px', textAlign: 'center', fontWeight: '700', fontSize: '1.1rem' }}>
                                {quantity}
                            </span>
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                style={{ width: '40px', height: '40px', border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                                +
                            </button>
                        </div>
                    </div>

                    {/* Total Price */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#F3F4F6', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: '600', color: '#4B5563' }}>Subtotal:</span>
                        <span style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--primary-dark)' }}>
                            ${(currentPrice * quantity).toLocaleString('es-CO')}
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <button
                            onClick={handleAdd}
                            className="btn"
                            style={{
                                padding: '1.25rem',
                                fontSize: '1.1rem',
                                borderRadius: 'var(--radius-lg)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                border: '2px solid var(--primary)',
                                backgroundColor: 'white',
                                color: 'var(--primary-dark)',
                                fontWeight: '700'
                            }}
                        >
                            🛒 Añadir al Carrito
                        </button>
                        <button
                            onClick={handleBuyNow}
                            className="btn btn-primary"
                            style={{
                                padding: '1.25rem',
                                fontSize: '1.1rem',
                                borderRadius: 'var(--radius-lg)',
                                fontWeight: '800',
                                boxShadow: '0 4px 14px rgba(46, 204, 113, 0.3)'
                            }}
                        >
                            ⚡ Comprar Ahora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
