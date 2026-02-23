'use client';

'use client';

import { useState } from 'react';
import Link from 'next/link';
import QuickViewModal from './QuickViewModal';

// Define TS type based on our database schema
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

export default function ProductCard({ product }: { product: Product }) {
    const [isHovered, setIsHovered] = useState(false);
    const [showQuickView, setShowQuickView] = useState(false);

    const handleQuickViewClick = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent Link navigation
        e.stopPropagation(); // Stop event bubbling
        setShowQuickView(true);
    };

    return (
        <>
            <Link href={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    overflow: 'hidden',
                    transition: 'transform 0.2s',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative' // For button positioning
                }}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {/* IMAGE HEADER */}
                    <div style={{ position: 'relative', height: '200px', width: '100%', backgroundColor: '#f0f0f0' }}>
                        {product.image_url ? (
                            <img
                                src={product.image_url}
                                alt={product.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=400';
                                }}
                            />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f3f4f6', color: '#9ca3af' }}>
                                <span style={{ fontSize: '3rem' }}>🍏</span>
                            </div>
                        )}

                        {/* QUICK VIEW BUTTON - Shopify Style */}
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: `translateX(-50%) translateY(${isHovered ? '0' : '20px'})`,
                            opacity: isHovered ? 1 : 0,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            width: '80%',
                            zIndex: 10
                        }}>
                            <button
                                onClick={handleQuickViewClick}
                                style={{
                                    width: '100%',
                                    padding: '0.6rem',
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    color: 'black',
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '30px',
                                    fontWeight: '600',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <span style={{ fontSize: '1.1rem' }}>👁️</span> Elegir
                            </button>
                        </div>
                    </div>

                    {/* CONTENT */}
                    <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.4rem', color: 'var(--text-main)' }}>{product.name}</h3>

                        <div style={{ marginTop: 'auto' }}>
                            <span style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--primary-dark)' }}>
                                ${product.base_price.toLocaleString('es-CO')}
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                / {product.unit_of_measure}
                            </span>
                        </div>
                    </div>
                </div>
            </Link>

            {/* MODAL */}
            {showQuickView && (
                <QuickViewModal
                    product={product}
                    onClose={() => setShowQuickView(false)}
                />
            )}
        </>
    );
}
