import { supabase, type Product } from '../lib/supabase';
import ProductCard from './ProductCard';
import { expandSearchQuery } from '@/lib/ai_search';
import { CATEGORY_MAP, REVERSE_CATEGORY_MAP } from '../lib/constants';
import { translations, Locale } from '../lib/translations';
import Link from 'next/link';
import FeaturedProductsCarousel from './FeaturedProductsCarousel';

interface Props {
    q?: string;
    category?: string;
    locale: Locale;
    allVisible: Product[];
    finalFeatured: Product[];
}

export default async function ProductGridContainer({ q, category, locale, allVisible, finalFeatured }: Props) {
    const t = translations[locale];
    
    // 1. Optimized Catalog Products Logic (Hybrid Search)
    let rawProducts: Product[] = [];
    let fallbackCategoryName = '';
    
    // A. Fast In-Memory Filter (Instant)
    const normalizedQ = q ? q.toLowerCase().trim() : '';
    const memoryFiltered = allVisible.filter(p => {
        const matchesCategory = !category || category === 'Todos' || p.category === category;
        if (!matchesCategory) return false;
        if (!normalizedQ) return true;
        
        return (
            p.name.toLowerCase().includes(normalizedQ) ||
            (p.display_name && p.display_name.toLowerCase().includes(normalizedQ)) ||
            (p.description && p.description.toLowerCase().includes(normalizedQ)) ||
            (p.keywords && p.keywords.toLowerCase().includes(normalizedQ)) ||
            (p.sku && p.sku.toLowerCase().includes(normalizedQ))
        );
    });

    // B. Extreme Parallel Search
    if (q && q.length > 2) {
        const aiResult = await Promise.race([
            expandSearchQuery(q),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI Timeout')), 1800))
        ]).catch(() => ({ terms: [q], category: 'DE' })) as { terms: string[], category?: string };
        
        const searchTerms = aiResult.terms.map(t => t.trim()).filter(t => t.length > 0);
        const suggestedCatCode = aiResult.category;

        const orConditions = [
            `name.ilike.%${q}%`,
            `description.ilike.%${q}%`,
            `display_name.ilike.%${q}%`
        ];
        searchTerms.forEach(term => {
            if (term !== q) {
                orConditions.push(`name.ilike.%${term}%`, `description.ilike.%${term}%`);
            }
        });

        const { data: dbProducts } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .eq('show_on_web', true)
            .or(orConditions.join(','))
            .limit(100);

        const foundProducts = dbProducts || [];

        if (foundProducts.length === 0 && suggestedCatCode) {
            const { data: catProducts } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .eq('show_on_web', true)
                .eq('category', suggestedCatCode)
                .limit(40);
            
            if (catProducts && catProducts.length > 0) {
                rawProducts = catProducts;
                fallbackCategoryName = CATEGORY_MAP[suggestedCatCode] || suggestedCatCode;
            }
        } else {
            const merged = [...memoryFiltered];
            const existingIds = new Set(merged.map(p => p.id));
            foundProducts.forEach(p => {
                if (!existingIds.has(p.id)) {
                    merged.push(p);
                    existingIds.add(p.id);
                }
            });
            rawProducts = merged;
        }
    } else {
        rawProducts = memoryFiltered;
    }

    const products = rawProducts; // Note: simplified for this component

    return (
        <>
            {products && products.length > 0 ? (
                <div style={{ position: 'relative' }}>
                    {fallbackCategoryName && (
                        <div style={{ 
                            backgroundColor: 'var(--accent)', 
                            color: 'var(--primary-dark)', 
                            padding: '1.2rem', 
                            borderRadius: '16px', 
                            marginBottom: '2.5rem',
                            textAlign: 'center',
                            fontWeight: '800',
                            border: '2px solid var(--primary)',
                            boxShadow: '0 10px 25px rgba(26, 77, 46, 0.08)',
                            fontSize: '1.1rem'
                        }}>
                            ✨ No encontramos resultados exactos para "{q}", pero aquí tienes nuestra sección de <strong>{fallbackCategoryName}</strong>
                        </div>
                    )}
                    <div 
                        id="catalog-scroll-area"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                            gap: '2rem',
                            maxHeight: '1000px', 
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            padding: '1.5rem',
                            borderRadius: 'var(--radius-lg)',
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'var(--primary) transparent',
                            scrollBehavior: 'smooth',
                            border: '1px solid rgba(0,0,0,0.03)',
                            backgroundColor: '#ffffff',
                            width: '100%'
                        }}
                        className="custom-scrollbar"
                    >
                        {products.map((product: Product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                    <div style={{ marginBottom: '3rem' }}>
                        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            {t.noProducts || 'No encontramos productos con ese nombre.'}
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <Link href={`/?${new URLSearchParams({ lang: locale === 'en' ? 'en' : 'es' }).toString()}#catalog`} scroll={false}>
                                <button className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', borderRadius: 'var(--radius-full)', fontWeight: '700' }}>
                                    Ver todo el catálogo
                                </button>
                            </Link>
                        </div>
                    </div>
                    
                    <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '4rem' }}>
                        <h3 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '1.8rem', fontWeight: '800', marginBottom: '2rem', color: 'var(--primary-dark)' }}>
                            Explora nuestros productos destacados
                        </h3>
                        <FeaturedProductsCarousel products={finalFeatured || []} />
                    </div>
                </div>
            )}
        </>
    );
}
