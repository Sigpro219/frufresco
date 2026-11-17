'use client';

import ProductCard from './ProductCard';
import { Product } from '@/lib/supabase';
import type { Locale } from '@/lib/translations';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    products: Product[];
    locale?: Locale;
}

export default function FeaturedProductsCarousel({ products, locale }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    if (!products || products.length === 0) return null;

    const trackItems = [...products, ...products];

    const scrollByAmount = (amount: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    return (
        <div 
            ref={containerRef}
            style={{ position: 'relative', padding: '1rem 0' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <style dangerouslySetInnerHTML={{__html: `
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .sf-marquee-track {
                    display: flex;
                    align-items: stretch;
                    gap: 1.25rem;
                    width: max-content;
                    animation: sfTop10Marquee 42s linear infinite;
                    will-change: transform;
                }
                .sf-marquee-paused {
                    animation-play-state: paused;
                }
                @keyframes sfTop10Marquee {
                    0% { transform: translate3d(0, 0, 0); }
                    100% { transform: translate3d(-50%, 0, 0); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .sf-marquee-track { animation: none; }
                }
            `}} />
            
            <div 
                ref={scrollRef}
                style={{ 
                    overflowX: 'auto', 
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    padding: '0.75rem 54px',
                    scrollBehavior: 'smooth'
                }}
                className="hide-scrollbar"
            >
                <div className={`sf-marquee-track ${isHovered ? 'sf-marquee-paused' : ''}`}>
                    {trackItems.map((p, idx) => (
                        <div key={`${p.id}-${idx}`} style={{ minWidth: '264px', maxWidth: '264px', flexShrink: 0, display: 'flex' }}>
                            <ProductCard product={p} locale={locale} />
                        </div>
                    ))}
                </div>
            </div>

            {/* BOTÓN IZQUIERDA */}
            <button 
                onClick={() => scrollByAmount(-284 * 2)}
                style={{
                    position: 'absolute',
                    left: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 20,
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.88)',
                    border: '1px solid rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 8px 24px rgba(8, 28, 21, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    color: '#081C15',
                    transition: 'background-color 200ms ease, color 200ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease, border-color 200ms ease, opacity 200ms ease',
                    opacity: isHovered ? 1 : 0.82
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#081C15';
                    e.currentTarget.style.color = '#FFFFFF';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(8, 28, 21, 0.22)';
                    e.currentTarget.style.borderColor = '#081C15';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.88)';
                    e.currentTarget.style.color = '#081C15';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(8, 28, 21, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.95)';
                }}
                aria-label="Anterior"
            >
                <ChevronLeft size={22} strokeWidth={2.5} />
            </button>

            {/* BOTÓN DERECHA */}
            <button 
                onClick={() => scrollByAmount(284 * 2)}
                style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 20,
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.88)',
                    border: '1px solid rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 8px 24px rgba(8, 28, 21, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    color: '#081C15',
                    transition: 'background-color 200ms ease, color 200ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease, border-color 200ms ease, opacity 200ms ease',
                    opacity: isHovered ? 1 : 0.82
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#081C15';
                    e.currentTarget.style.color = '#FFFFFF';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(8, 28, 21, 0.22)';
                    e.currentTarget.style.borderColor = '#081C15';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.88)';
                    e.currentTarget.style.color = '#081C15';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(8, 28, 21, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.95)';
                }}
                aria-label="Siguiente"
            >
                <ChevronRight size={22} strokeWidth={2.5} />
            </button>
        </div>
    );
}
