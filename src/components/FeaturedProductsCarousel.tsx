'use client';

import ProductCard from './ProductCard';
import { Product } from '@/lib/supabase';

interface Props {
    products: Product[];
}

export default function FeaturedProductsCarousel({ products }: Props) {
    if (!products || products.length === 0) return null;

    // Duplicar productos para el loop infinito (3 veces para cubrir el viewport en pantallas ultra-anchas)
    const displayProducts = [...products, ...products, ...products];

    return (
        <div style={{ 
            width: '100%', 
            overflow: 'hidden', 
            padding: '2rem 0',
            position: 'relative'
        }}>
            <style jsx>{`
                .ticker-wrapper {
                    display: flex;
                    gap: 1.5rem;
                    width: fit-content;
                    animation: ticker 120s linear infinite;
                    padding-right: 1.5rem; /* Gap for the loop */
                }

                @keyframes ticker {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-33.3333%);
                    }
                }

                .ticker-wrapper:hover {
                    animation-play-state: paused;
                }

                .product-item {
                    min-width: 280px;
                    max-width: 280px;
                    flex-shrink: 0;
                }
            `}</style>

            <div className="ticker-wrapper">
                {displayProducts.map((p, i) => (
                    <div key={`${p.id}-${i}`} className="product-item">
                        <ProductCard product={p} />
                    </div>
                ))}
            </div>
            
            {/* Sombras difuminadas en los bordes - Más suaves para no cortar */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '60px',
                height: '100%',
                background: 'linear-gradient(to right, rgba(255,255,255,0.9), transparent)',
                zIndex: 10,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '60px',
                height: '100%',
                background: 'linear-gradient(to left, rgba(255,255,255,0.9), transparent)',
                zIndex: 10,
                pointerEvents: 'none'
            }} />
        </div>
    );
}
