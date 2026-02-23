'use client';

import { useRef } from 'react';
import ProductCard from './ProductCard';
import { Product } from '@/lib/supabase';

interface Props {
    products: Product[];
}

export default function FeaturedProductsCarousel({ products }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Navigation Buttons */}
            <button
                onClick={() => scroll('left')}
                style={{
                    position: 'absolute',
                    left: '-20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)',
                    zIndex: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    color: 'var(--text-main)',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--primary)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.color = 'var(--text-main)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                }}
            >
                ←
            </button>

            <button
                onClick={() => scroll('right')}
                style={{
                    position: 'absolute',
                    right: '-20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)',
                    zIndex: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    color: 'var(--text-main)',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--primary)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.color = 'var(--text-main)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                }}
            >
                →
            </button>

            {/* Scroll Container */}
            <div
                ref={scrollRef}
                style={{
                    display: 'flex',
                    gap: '1.5rem',
                    overflowX: 'auto',
                    paddingBottom: '1.5rem',
                    scrollSnapType: 'x mandatory',
                    msOverflowStyle: 'none',
                    scrollbarWidth: 'none'
                }}
            >
                {products.map((p) => (
                    <div key={p.id} style={{
                        minWidth: '280px',
                        maxWidth: '280px',
                        scrollSnapAlign: 'start'
                    }}>
                        <ProductCard product={p} />
                    </div>
                ))}
            </div>
        </div>
    );
}
