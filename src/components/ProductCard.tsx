'use client';

import { useState } from 'react';
import { Product } from '../lib/supabase';
import { Apple, Eye } from 'lucide-react';
import Link from 'next/link';
import QuickViewModal from './QuickViewModal';

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
                    boxShadow: isHovered ? 'var(--shadow-premium)' : '0 4px 20px rgba(0,0,0,0.03)',
                    overflow: 'hidden',
                    transition: 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative',
                    transform: isHovered ? 'translateY(-8px)' : 'translateY(0)'
                }}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {/* IMAGE HEADER */}
                    <div style={{ position: 'relative', height: '240px', width: '100%', backgroundColor: '#f9fafb', overflow: 'hidden' }}>
                        {product.image_url ? (
                            <img
                                src={product.image_url}
                                alt={product.name}
                                style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'cover',
                                    transition: 'transform 0.6s ease',
                                    transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                                }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=400';
                                }}
                            />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f3f4f6', color: 'var(--primary)', opacity: 0.3 }}>
                                <Apple size={60} strokeWidth={1} />
                            </div>
                        )}

                        {/* QUICK VIEW BUTTON - Premium Glass Style */}
                        <div style={{
                            position: 'absolute',
                            bottom: '16px',
                            left: '50%',
                            transform: `translateX(-50%) translateY(${isHovered ? '0' : '20px'})`,
                            opacity: isHovered ? 1 : 0,
                            transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
                            width: '85%',
                            zIndex: 10
                        }}>
                            <button
                                onClick={handleQuickViewClick}
                                style={{
                                    width: '100%',
                                    padding: '0.8rem',
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    color: '#1A4D2E',
                                    border: '1px solid rgba(255,255,255,0.4)',
                                    borderRadius: 'var(--radius-full)',
                                    fontWeight: '800',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    backdropFilter: 'blur(10px)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}
                            >
                                <Eye size={18} strokeWidth={2.5} /> Vista Rápida
                            </button>
                        </div>
                    </div>

                    {/* CONTENT */}
                    <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <h3 style={{ 
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: '1.25rem', 
                            fontWeight: '800', 
                            color: 'var(--text-main)',
                            lineHeight: '1.2',
                            margin: 0
                        }}>{product.name}</h3>

                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--primary)' }}>
                                ${product.base_price.toLocaleString('es-CO')}
                            </span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' }}>
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
