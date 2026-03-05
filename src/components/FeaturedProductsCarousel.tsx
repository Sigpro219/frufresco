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
                    animation: ticker 80s linear infinite;
                }

                @keyframes ticker {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(calc(-33.33% - 0.5rem));
                    }
                }

                .ticker-wrapper:hover {
                    animation-play-state: paused;
                }

                .product-item {
                    min-width: 280px;
                    max-width: 280px;
                }
            `}</style>

            <div className="ticker-wrapper">
                {displayProducts.map((p, i) => (
                    <div key={`${p.id}-${i}`} className="product-item">
                        <ProductCard product={p} />
                    </div>
                ))}
            </div>
            
            {/* Sombras difuminadas en los bordes para un toque premium */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100px',
                height: '100%',
                background: 'linear-gradient(to right, white, transparent)',
                zIndex: 10,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '100px',
                height: '100%',
                background: 'linear-gradient(to left, white, transparent)',
                zIndex: 10,
                pointerEvents: 'none'
            }} />
        </div>
    );
}
