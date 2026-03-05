import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import ProductDetailClient from '@/components/ProductDetailClient';
import ProductCard from '@/components/ProductCard';
import { notFound } from 'next/navigation';
import { Apple } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // 1. Fetch Current Product
    const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !product) {
        return notFound();
    }

    // 2. Fetch "You May Also Like" - Priorizar misma categoría y con foto
    // Traemos 50 para poder barajar y quedarnos con los mejores 12
    const { data: relatedProductsRaw } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('show_on_web', true)
        .neq('id', id)
        .order('image_url', { ascending: false, nullsFirst: false }) // Fotos primero
        .limit(50);

    const dailySeed = new Date().getDate();
    
    const relatedProducts = relatedProductsRaw ? [...relatedProductsRaw].sort((a, b) => {
        // 1. Prioridad: Misma categoría
        const sameCatA = a.category === product.category ? 1 : 0;
        const sameCatB = b.category === product.category ? 1 : 0;
        if (sameCatA !== sameCatB) return sameCatB - sameCatA;

        // 2. Prioridad: Tiene foto
        const hasA = a.image_url && a.image_url.includes('http') ? 1 : 0;
        const hasB = b.image_url && b.image_url.includes('http') ? 1 : 0;
        if (hasA !== hasB) return hasB - hasA;

        // 3. Shuffle estable
        const scoreA = (parseInt(a.id.slice(0, 8), 16) || a.name.length) * dailySeed;
        const scoreB = (parseInt(b.id.slice(0, 8), 16) || b.name.length) * dailySeed;
        return (scoreA % 100) - (scoreB % 100);
    }).slice(0, 6) : []; // Mostramos 6 para un diseño más limpio (2 filas de 3)

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: '5rem' }}>
            <Navbar />
            <div className="container" style={{ paddingTop: '2rem' }}>
                <ProductDetailClient product={product} />

                {/* Related Products Section */}
                {relatedProducts && relatedProducts.length > 0 && (
                    <section style={{ marginTop: '8rem' }}>
                        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                            <span style={{ 
                                color: 'var(--primary)', 
                                fontWeight: '800', 
                                letterSpacing: '0.2rem', 
                                fontSize: '0.85rem',
                                textTransform: 'uppercase'
                            }}>Completa tu pedido</span>
                            <h2 style={{
                                fontSize: '2.5rem',
                                fontWeight: '900',
                                marginTop: '0.5rem',
                                color: 'var(--primary-dark)',
                                letterSpacing: '-0.02em',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '15px'
                            }}>
                                También te podría interesar
                                <Apple className="text-primary" size={32} strokeWidth={2.5} />
                            </h2>
                        </div>
                        
                        <div style={{ position: 'relative' }}>
                            <div 
                                id="related-scroll-area"
                                className="related-grid custom-scrollbar"
                                style={{
                                    display: 'grid',
                                    gap: '2rem',
                                    maxHeight: '1000px',
                                    overflowY: 'auto',
                                    padding: '1.5rem 1.5rem 5rem 1.5rem', // Much more bottom padding to avoid clipping
                                    borderRadius: 'var(--radius-lg)',
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: 'var(--primary) transparent',
                                    scrollBehavior: 'smooth',
                                    border: '1px solid rgba(0,0,0,0.03)',
                                    backgroundColor: '#ffffff'
                                }}
                            >
                                {relatedProducts.map((p) => (
                                    <ProductCard key={p.id} product={p} />
                                ))}
                            </div>
                            
                            {/* Fade Effect at the bottom */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '100px',
                                background: 'linear-gradient(to top, rgba(255,255,255,0.95), transparent)',
                                zIndex: 10,
                                pointerEvents: 'none',
                                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
                            }} />
                        </div>
                    </section>
                )}
            </div>

            {/* CSS for custom scrollbar and responsive grid logic */}
            <style dangerouslySetInnerHTML={{ __html: `
                .related-grid {
                    grid-template-columns: repeat(3, 1fr);
                }
                
                @media (max-width: 768px) {
                    .related-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                
                @media (max-width: 480px) {
                    .related-grid {
                        grid-template-columns: repeat(1, 1fr);
                    }
                }

                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: var(--primary);
                    border-radius: 20px;
                    border: 3px solid transparent;
                }
                .custom-scrollbar {
                    mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
                    -webkit-mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
                }
            `}} />
        </main>
    );
}
