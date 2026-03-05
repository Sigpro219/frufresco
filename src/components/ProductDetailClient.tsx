'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/cartContext';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag, Zap, Plus, Minus, ChevronRight, Apple } from 'lucide-react';
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
    show_on_web?: boolean;
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

    // Solo considerar variantes que estén marcadas para mostrarse en web
    const visibleVariants = (product.variants || []).filter(v => (v as any).show_on_web !== false);

    // Calcular el precio actual basado en la variante seleccionada (solo de las visibles)
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
            <nav style={{ marginBottom: '2.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link href="/" style={{ color: 'inherit', textDecoration: 'none', fontWeight: '500' }}>Inicio</Link> 
                <ChevronRight size={14} />
                <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{product.name}</span>
            </nav>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '4rem', alignItems: 'start' }}>
                {/* Left: Image Container */}
                <div style={{
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-premium)',
                    backgroundColor: '#f9f9f9',
                    position: 'relative',
                    aspectRatio: '1/1'
                }}>
                    <Image
                        src={product.image_url || '/placeholder_produce.png'}
                        alt={product.name}
                        fill
                        style={{ objectFit: 'cover' }}
                        priority
                    />
                </div>

                {/* Right: Product Info */}
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                        {product.name}
                    </h1>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-dark)', marginBottom: '1.5rem' }}>
                        {currentPrice !== undefined ? (
                            `$${currentPrice.toLocaleString('es-CO')}`
                        ) : (
                            <span style={{ fontSize: '1.1rem', color: '#666', fontStyle: 'italic' }}>Precio a consultar</span>
                        )}
                        <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: '0.5rem' }}>
                            por {product.unit_of_measure || 'Un'}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid var(--border)', width: 'fit-content', padding: '0.4rem', borderRadius: 'var(--radius-md)', backgroundColor: 'white' }}>
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                style={{ width: '40px', height: '40px', border: 'none', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s' }}>
                                <Minus size={18} strokeWidth={2.5} />
                            </button>
                            <span style={{ width: '40px', textAlign: 'center', fontWeight: '800', fontSize: '1.2rem', color: 'var(--primary-dark)' }}>
                                {quantity}
                            </span>
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                style={{ width: '40px', height: '40px', border: 'none', background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s' }}>
                                <Plus size={18} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>

                    {/* Total Price & Availability */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: isAvailable ? '#F3F4F6' : '#FEF2F2', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            {!isAvailable && <span style={{ color: '#EF4444', fontWeight: '800', fontSize: '0.9rem', display: 'block' }}>⚠️ Combinación no disponible</span>}
                            <span style={{ fontSize: '1.1rem', fontWeight: '600', color: '#4B5563' }}>Subtotal:</span>
                        </div>
                        <span style={{ fontSize: '1.8rem', fontWeight: '800', color: isAvailable ? 'var(--primary-dark)' : '#9CA3AF' }}>
                            {currentPrice !== undefined ? (
                                `$${(currentPrice * (isAvailable ? quantity : 1)).toLocaleString('es-CO')}`
                            ) : (
                                '---'
                            )}
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <button
                            onClick={handleAdd}
                            disabled={!isAvailable}
                            className="btn btn-premium"
                            style={{
                                padding: '1.25rem',
                                fontSize: '1.1rem',
                                borderRadius: 'var(--radius-lg)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.8rem',
                                border: `2px solid ${isAvailable ? 'var(--primary)' : '#D1D5DB'}`,
                                backgroundColor: 'white',
                                color: isAvailable ? 'var(--primary-dark)' : '#9CA3AF',
                                fontWeight: '700',
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
                                transition: 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)'
                            }}
                        >
                            <ShoppingBag size={20} strokeWidth={2.5} /> 
                            {isAvailable ? 'Añadir al Carrito' : 'No disponible'}
                        </button>
                        <button
                            onClick={handleBuyNow}
                            disabled={!isAvailable}
                            className={isAvailable ? "btn btn-primary btn-premium" : ""}
                            style={{
                                padding: '1.25rem',
                                fontSize: '1.1rem',
                                borderRadius: 'var(--radius-lg)',
                                fontWeight: '800',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.8rem',
                                boxShadow: isAvailable ? '0 10px 20px rgba(26, 77, 46, 0.15)' : 'none',
                                backgroundColor: isAvailable ? 'var(--primary)' : '#F3F4F6',
                                color: isAvailable ? 'white' : '#9CA3AF',
                                border: 'none',
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
                                transition: 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)'
                            }}
                        >
                            <Zap size={20} strokeWidth={2.5} fill={isAvailable ? "currentColor" : "none"} /> 
                            {isAvailable ? 'Comprar Ahora' : 'Agotado'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
