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
            className="sf-featured-carousel"
            style={{ position: 'relative', padding: '0.75rem 0' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <style dangerouslySetInnerHTML={{__html: `
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .sf-carousel-scroll {
                    overflow-x: auto;
                    scrollbar-width: none;
                    ms-overflow-style: none;
                    padding: 0.75rem 54px;
                    scroll-behavior: smooth;
                    scroll-snap-type: x mandatory;
                    -webkit-overflow-scrolling: touch;
                    overscroll-behavior-x: contain;
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
                .sf-carousel-item {
                    min-width: 264px;
                    max-width: 264px;
                    flex-shrink: 0;
                    display: flex;
                    scroll-snap-align: start;
                }
                .sf-carousel-nav-btn {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    z-index: 20;
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background-color: rgba(255, 255, 255, 0.88);
                    border: 1px solid rgba(255, 255, 255, 0.95);
                    box-shadow: 0 8px 24px rgba(8, 28, 21, 0.12);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    color: #081C15;
                    transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), color 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1), border-color 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes sfTop10Marquee {
                    0% { transform: translate3d(0, 0, 0); }
                    100% { transform: translate3d(-50%, 0, 0); }
                }
                @media (max-width: 768px) {
                    .sf-carousel-scroll {
                        padding: 0.5rem 4px;
                    }
                    .sf-marquee-track {
                        animation: none;
                        gap: 0.75rem;
                    }
                    .sf-carousel-item {
                        min-width: clamp(216px, 68vw, 256px);
                        max-width: clamp(216px, 68vw, 256px);
                    }
                    .sf-carousel-nav-btn {
                        display: none;
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    .sf-marquee-track { animation: none; }
                    .sf-carousel-nav-btn { transition: none; }
                    .sf-carousel-scroll { scroll-behavior: auto; }
                }
            `}} />
            
            <div 
                ref={scrollRef}
                className="hide-scrollbar sf-carousel-scroll"
            >
                <div className={`sf-marquee-track ${isHovered ? 'sf-marquee-paused' : ''}`}>
                    {trackItems.map((p, idx) => (
                        <div key={`${p.id}-${idx}`} className="sf-carousel-item">
                            <ProductCard product={p} locale={locale} />
                        </div>
                    ))}
                </div>
            </div>

            {/* BOTÓN IZQUIERDA */}
            <button 
                onClick={() => scrollByAmount(-284 * 2)}
                className="sf-carousel-nav-btn"
                style={{
                    left: '6px',
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
                className="sf-carousel-nav-btn"
                style={{
                    right: '6px',
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
