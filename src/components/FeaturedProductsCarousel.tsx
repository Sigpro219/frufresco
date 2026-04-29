'use client';

import ProductCard from './ProductCard';
import { Product } from '@/lib/supabase';
import { useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    products: Product[];
}

export default function FeaturedProductsCarousel({ products }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    if (!products || products.length === 0) return null;

    // Duplicar para ilusión de infinito (suficiente para que el scroll manual no se quede sin items)
    const displayProducts = [...products, ...products, ...products, ...products];

    const exactScrollRef = useRef<number>(0);

    useEffect(() => {
        let animationFrameId: number;
        let lastTime = performance.now();
        const speed = 0.048; // Pixeles por milisegundo (ajustado -20%)

        // Sincronizar en caso de scroll manual previo
        if (scrollRef.current && exactScrollRef.current === 0) {
            exactScrollRef.current = scrollRef.current.scrollLeft;
        }

        const scroll = (time: number) => {
            const delta = time - lastTime;
            lastTime = time;

            if (scrollRef.current && !isHovered) {
                // Si alguien hizo scroll manual (touch/trackpad), actualizamos la referencia exacta
                if (Math.abs(scrollRef.current.scrollLeft - Math.round(exactScrollRef.current)) > 2) {
                    exactScrollRef.current = scrollRef.current.scrollLeft;
                }

                exactScrollRef.current += speed * delta;
                scrollRef.current.scrollLeft = exactScrollRef.current;
                
                // Lógica de loop infinito
                const singleSetWidth = products.length * 304; 
                if (scrollRef.current.scrollLeft >= singleSetWidth * 2) {
                    exactScrollRef.current -= singleSetWidth;
                    scrollRef.current.scrollLeft = exactScrollRef.current;
                }
            }
            animationFrameId = requestAnimationFrame(scroll);
        };

        animationFrameId = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isHovered, products.length]);

    const scrollByAmount = (amount: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
            // Sincronizar después de la animación de scroll
            setTimeout(() => {
                if (scrollRef.current) {
                    exactScrollRef.current = scrollRef.current.scrollLeft;
                }
            }, 600);
        }
    };

    return (
        <div 
            style={{ position: 'relative', padding: '1rem 0' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <style dangerouslySetInnerHTML={{__html: `
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
            `}} />
            
            <div 
                ref={scrollRef}
                style={{ 
                    display: 'flex', 
                    gap: '1.5rem', 
                    overflowX: 'auto', 
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    padding: '1rem 40px', // Espacio para que la sombra del hover de la tarjeta no se corte
                    scrollBehavior: 'auto' // El smooth se aplica solo en el botón
                }}
                className="hide-scrollbar"
            >
                {displayProducts.map((p, i) => (
                    <div key={`${p.id}-${i}`} style={{ minWidth: '280px', maxWidth: '280px', flexShrink: 0 }}>
                        <ProductCard product={p} />
                    </div>
                ))}
            </div>

            {/* Degradados laterales para suavizar los bordes */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100px', height: '100%', background: 'linear-gradient(to right, #FFFFFF 15%, transparent)', pointerEvents: 'none', zIndex: 10 }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100%', background: 'linear-gradient(to left, #FFFFFF 15%, transparent)', pointerEvents: 'none', zIndex: 10 }} />

            {/* BOTÓN IZQUIERDA */}
            <button 
                onClick={() => scrollByAmount(-304 * 2)}
                style={{
                    position: 'absolute',
                    left: '5px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 20,
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--primary)',
                    transition: 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)',
                    opacity: isHovered ? 1 : 0.4
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--primary)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 10px 30px rgba(26, 77, 46, 0.2)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                    e.currentTarget.style.color = 'var(--primary)';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                }}
                aria-label="Anterior"
            >
                <ChevronLeft size={24} strokeWidth={2.5} />
            </button>

            {/* BOTÓN DERECHA */}
            <button 
                onClick={() => scrollByAmount(304 * 2)}
                style={{
                    position: 'absolute',
                    right: '5px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 20,
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--primary)',
                    transition: 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)',
                    opacity: isHovered ? 1 : 0.4
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--primary)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 10px 30px rgba(26, 77, 46, 0.2)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                    e.currentTarget.style.color = 'var(--primary)';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                }}
                aria-label="Siguiente"
            >
                <ChevronRight size={24} strokeWidth={2.5} />
            </button>
        </div>
    );
}
