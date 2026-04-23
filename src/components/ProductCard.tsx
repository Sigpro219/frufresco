'use client';

import { useState, useEffect } from 'react';
import { Product } from '../lib/supabase';
import { Apple, Eye, Info } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import QuickViewModal from './QuickViewModal';
import { useSearchParams } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

export default function ProductCard({ product }: { product: Product }) {
    const [isHovered, setIsHovered] = useState(false);
    const [showQuickView, setShowQuickView] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const searchParams = useSearchParams();
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];
    const [displayName, setDisplayName] = useState(
        locale === 'en' && product.name_en ? product.name_en : (product.display_name || product.name)
    );

    useEffect(() => {
        // Al cargar, priorizamos la traducción de la BD si estamos en inglés
        if (locale === 'en' && product.name_en) {
            setDisplayName(product.name_en);
        } else {
            setDisplayName(product.display_name || product.name);
        }
    }, [product.display_name, product.name, product.name_en, locale]);

    useEffect(() => {
        // Optimización: No disparamos traducciones automáticas en bucle para evitar saturación.
        // La página ya baja un translationCache que applyNicknames usa en el servidor.
        if (locale === 'en' && !product.name_en && displayName === product.name) {
            // Podríamos disparar una traducción solo si el usuario interactúa (ej: hover prolongado)
            // o simplemente dejar que el servidor maneje la mayoría.
        }
    }, [locale, product.name, displayName]);

    const handleQuickViewClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowQuickView(true);
    };


    return (
        <>
            <div style={{
                backgroundColor: 'var(--surface)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: isHovered ? 'var(--shadow-premium)' : '0 4px 15px rgba(0,0,0,0.02)',
                overflow: 'hidden',
                transition: 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transform: isHovered ? 'translateY(-10px)' : 'translateY(0)',
                height: '100%'
            }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* IMAGE HEADER - Link specifically the image */}
                <Link href={`/products/${product.id}${locale === 'en' ? '?lang=en' : ''}`} style={{ display: 'block', position: 'relative', height: '220px', width: '100%', backgroundColor: '#f9fafb', overflow: 'hidden' }}>
                    
                    {/* SKELETON LOADER (Shimmer) */}
                    {!imageLoaded && product.image_url && (
                        <div className="shimmer" style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            zIndex: 2
                        }} />
                    )}

                    {product.image_url ? (
                        <Image
                            src={product.image_url}
                            alt={product.name}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            quality={75} 
                            onLoadingComplete={() => setImageLoaded(true)}
                            style={{ 
                                objectFit: 'cover',
                                transition: 'transform 0.8s cubic-bezier(0.2, 0, 0.2, 1), opacity 0.5s ease-in-out',
                                transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                                opacity: imageLoaded ? 1 : 0
                            }}
                            priority={false} 
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f3f4f6', color: 'var(--primary)', opacity: 0.3 }}>
                            <Apple size={60} strokeWidth={1} />
                        </div>
                    )}

                    {/* OVERLAY ACTIONS (Show on Hover) */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.4))',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.3s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '1.2rem',
                        gap: '0.8rem',
                        zIndex: 5
                    }}>
                            <button
                            onClick={handleQuickViewClick}
                            style={{
                                width: 'fit-content',
                                alignSelf: 'center',
                                padding: '0.6rem 2rem',
                                backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                color: 'var(--primary-dark)',
                                border: '1px solid rgba(255, 255, 255, 0.4)',
                                borderRadius: 'var(--radius-full)',
                                fontWeight: '700',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                                transform: isHovered ? 'translateY(0)' : 'translateY(15px)',
                                transition: 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
                                letterSpacing: '0.05em'
                            }}
                        >
                            <Eye size={14} strokeWidth={2.5} /> {t.quickView}
                        </button>
                    </div>

                    {/* BADGES DE ETIQUETAS (TAGS) */}
                    <div style={{ 
                        position: 'absolute', 
                        top: '12px', 
                        right: '12px', 
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        zIndex: 10
                    }}>
                        {product.tags?.map((tag, i) => {
                            const isPromo = tag.toLowerCase().includes('oferta') || tag.toLowerCase().includes('descuento');
                            const isFresh = tag.toLowerCase().includes('fresco') || tag.toLowerCase().includes('viva');
                            
                            return (
                                <div key={i} style={{ 
                                    backgroundColor: isPromo ? 'rgba(239, 68, 68, 0.9)' : isFresh ? 'rgba(16, 185, 129, 0.9)' : 'rgba(255, 255, 255, 0.85)', 
                                    padding: '4px 10px', 
                                    borderRadius: '50px',
                                    fontSize: '0.65rem',
                                    fontWeight: '800',
                                    color: (isPromo || isFresh) ? 'white' : 'var(--primary-dark)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    backdropFilter: 'blur(4px)',
                                    WebkitBackdropFilter: 'blur(4px)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                    {tag}
                                </div>
                            );
                        })}
                    </div>
                </Link>

                {/* CONTENT */}
                <div style={{ padding: '1.2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <Link href={`/products/${product.id}${locale === 'en' ? '?lang=en' : ''}`} style={{ textDecoration: 'none' }}>
                        <h3 style={{ 
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: '1.2rem', 
                            fontWeight: '800', 
                            color: 'var(--text-main)',
                            lineHeight: '1.2',
                            margin: 0,
                            minHeight: '2.4em',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}>{displayName}</h3>
                    </Link>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        {product.base_price > 0 ? (
                            <>
                                <span style={{ fontSize: '1.35rem', fontWeight: '900', color: 'var(--primary)' }}>
                                    ${((product.base_price || 0) * (product.web_conversion_factor || 1)).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                                    {locale === 'en' && <span style={{ fontSize: '0.8rem', marginLeft: '4px', opacity: 0.8 }}>COP</span>}
                                </span>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                    / {product.web_unit || product.unit_of_measure || 'Un'}
                                </span>
                            </>
                        ) : (
                            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#666', fontStyle: 'italic', letterSpacing: '-0.01em' }}>
                                Precio a consultar
                            </span>
                        )}
                    </div>

                    {/* ACTION BUTTONS */}
                    <div style={{ marginTop: '0.8rem' }}>
                        <Link href={`/products/${product.id}${locale === 'en' ? '?lang=en' : ''}`} style={{ textDecoration: 'none' }}>
                            <div style={{
                                width: '100%',
                                height: '42px',
                                backgroundColor: 'rgba(26, 77, 46, 0.04)',
                                color: 'var(--primary-dark)',
                                border: '1px solid rgba(26, 77, 46, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--primary)';
                                e.currentTarget.style.color = 'white';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 15px rgba(26, 77, 46, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(26, 77, 46, 0.04)';
                                e.currentTarget.style.color = 'var(--primary-dark)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                            >
                                {t.viewProduct} <Info size={16} strokeWidth={2} />
                            </div>
                        </Link>
                    </div>
                </div>
            </div>

            {/* QUICK VIEW LOGIC */}
            {showQuickView && (
                <div onClick={(e) => e.stopPropagation()}>
                    <QuickViewModal 
                        product={product} 
                        onClose={() => setShowQuickView(false)} 
                    />
                </div>
            )}
        </>
    );
}
