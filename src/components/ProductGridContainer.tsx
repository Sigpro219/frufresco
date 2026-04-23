import { supabase, type Product } from '../lib/supabase';
import ProductCard from './ProductCard';
import { expandSearchQuery } from '@/lib/ai_search';
import { CATEGORY_MAP } from '../lib/constants';
import { translations, Locale } from '../lib/translations';
import Link from 'next/link';
import FeaturedProductsCarousel from './FeaturedProductsCarousel';

interface Props {
    q?: string;
    category?: string;
    locale: Locale;
}

export default async function ProductGridContainer({ q, category, locale }: Props) {
    const t = translations[locale];

    // 1. Data Fetching for the Grid
    const [
        allVisibleResponse,
        sessionResponse,
        translationCacheResponse
    ] = await Promise.all([
        supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .eq('show_on_web', true)
            .order('image_url', { ascending: false, nullsFirst: false })
            .limit(300),
        supabase.auth.getSession(),
        locale === 'en'
            ? supabase.from('product_translations_cache').select('source_text, translated_text').eq('lang', 'en')
            : Promise.resolve({ data: [] })
    ]);

    const allVisible = allVisibleResponse.data || [];
    const session = sessionResponse.data?.session;
    const userId = session?.user?.id;

    // Fetch nicknames if user is logged in
    const { data: nicknamesData } = userId 
        ? await supabase.from('product_nicknames').select('product_id, custom_name').eq('profile_id', userId)
        : { data: [] };

    const nicknameMap = (nicknamesData || []).reduce((acc, item) => ({
        ...acc,
        [item.product_id]: item.custom_name
    }), {} as Record<string, string>);

    const translationCache = (translationCacheResponse.data || []).reduce((acc, item) => ({
        ...acc,
        [item.source_text]: item.translated_text
    }), {} as Record<string, string>);

    const applyNicknames = (plist: Product[]) => plist.map(p => ({
        ...p,
        display_name: nicknameMap[p.id] || translationCache[p.name] || p.display_name || p.name
    }));

    const productsWithNicknames = applyNicknames(allVisible);

    // 2. Search & Filter Logic
    let rawProducts: Product[] = [];
    let fallbackCategoryName = '';
    
    const normalizedQ = q ? q.toLowerCase().trim() : '';
    const memoryFiltered = productsWithNicknames.filter(p => {
        const matchesCategory = !category || category === 'Todos' || p.category === category;
        if (!matchesCategory) return false;
        if (!normalizedQ) return true;
        
        return (
            p.name.toLowerCase().includes(normalizedQ) ||
            (p.display_name && p.display_name.toLowerCase().includes(normalizedQ)) ||
            (p.description && p.description.toLowerCase().includes(normalizedQ)) ||
            (p.keywords && p.keywords.toLowerCase().includes(normalizedQ))
        );
    });

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
            if (term !== q) orConditions.push(`name.ilike.%${term}%`);
        });

        const { data: dbProducts } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .eq('show_on_web', true)
            .or(orConditions.join(','))
            .limit(100);

        const foundProducts = applyNicknames(dbProducts || []);

        if (foundProducts.length === 0 && suggestedCatCode) {
            const { data: catProducts } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .eq('show_on_web', true)
                .eq('category', suggestedCatCode)
                .limit(40);
            
            if (catProducts && catProducts.length > 0) {
                rawProducts = applyNicknames(catProducts);
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

    return (
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
                    boxShadow: '0 10px 25px rgba(26, 77, 46, 0.08)'
                }}>
                    ✨ No encontramos resultados exactos para "{q}", pero aquí tienes nuestra sección de <strong>{fallbackCategoryName}</strong>
                </div>
            )}
            
            {rawProducts.length > 0 ? (
                <div 
                    id="catalog-scroll-area"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '2rem',
                        padding: '1.5rem',
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: '#ffffff'
                    }}
                    className="custom-scrollbar"
                >
                    {rawProducts.map((product: Product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                    <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>
                        {t.noProducts || 'No encontramos productos con ese nombre.'}
                    </p>
                </div>
            )}
        </div>
    );
}
