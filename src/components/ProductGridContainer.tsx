import { type Product } from '../lib/supabase';
import { getVisibleProducts, getTranslationCache } from '../lib/data';
import ProductCard from './ProductCard';
import { expandSearchQuery } from '@/lib/ai_search';
import { CATEGORY_MAP } from '../lib/constants';
import { translations, Locale } from '../lib/translations';
import Link from 'next/link';
import FeaturedProductsCarousel from './FeaturedProductsCarousel';
import ProductGridClient from './ProductGridClient';
import { supabase } from '../lib/supabase';
import { createServerSideClient } from '@/lib/supabase/server';

interface Props {
    q?: string;
    category?: string;
    locale: Locale;
}

export default async function ProductGridContainer({ q, category, locale }: Props) {
    const t = translations[locale];

    const serverSupabase = await createServerSideClient();
    const { data: { session } } = await serverSupabase.auth.getSession();
    const userId = session?.user?.id;

    let pricingModelId = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee'; // Default B2C
    if (userId) {
        const { data: profile } = await serverSupabase
            .from('profiles')
            .select('pricing_model_id')
            .eq('id', userId)
            .single();
        if (profile?.pricing_model_id) {
            pricingModelId = profile.pricing_model_id;
        }
    }

    // 1. Data Fetching for the Grid (Optimized with Cache)
    const [
        allVisible,
        translationCache
    ] = await Promise.all([
        getVisibleProducts(pricingModelId),
        locale === 'en' ? getTranslationCache() : Promise.resolve({})
    ]);

    // Fetch nicknames if user is logged in
    const { data: nicknamesData } = userId 
        ? await serverSupabase.from('product_nicknames').select('product_id, nickname').eq('customer_id', userId)
        : { data: [] };

    const nicknameMap = (nicknamesData || []).reduce((acc, item) => ({
        ...acc,
        [item.product_id]: item.nickname
    }), {} as Record<string, string>);

    // Translations are now an object from cache

    const applyNicknames = (plist: Product[]) => plist.map(p => {
        const baseTranslated = locale === 'en' 
            ? (p.name_en || translationCache[p.name] || p.display_name || p.name)
            : (p.display_name || p.name);
        
        return {
            ...p,
            display_name: nicknameMap[p.id] || baseTranslated
        };
    });

    const productsWithNicknames = applyNicknames(allVisible);

    // 2. Search & Filter Logic
    let rawProducts: Product[] = [];
    let fallbackCategoryName = '';
    
    // Split the query by comma to allow multiple independent searches at once
    const searchQueries = q ? q.toLowerCase().split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
    
    const memoryFiltered = productsWithNicknames.filter(p => {
        const matchesCategory = !category || category === 'Todos' || p.category === category;
        if (!matchesCategory) return false;
        if (searchQueries.length === 0) return true;
        
        // The product must match at least ONE of the comma-separated terms (OR logic)
        return searchQueries.some(sq => 
            p.name.toLowerCase().includes(sq) ||
            (p.display_name && p.display_name.toLowerCase().includes(sq)) ||
            (p.description && p.description.toLowerCase().includes(sq)) ||
            (p.keywords && p.keywords.toLowerCase().includes(sq))
        );
    });

    if (q && q.length > 2) {
        const aiResult = await Promise.race([
            expandSearchQuery(q),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI Timeout')), 1800))
        ]).catch(() => ({ terms: searchQueries, category: 'DE' })) as { terms: string[], category?: string };
        
        const searchTerms = aiResult.terms.map(t => t.trim()).filter(t => t.length > 0);
        const suggestedCatCode = aiResult.category;

        const orConditions: string[] = [];
        
        // Add all user-provided comma-separated terms
        searchQueries.forEach(sq => {
            orConditions.push(`name.ilike.%${sq}%`);
            orConditions.push(`description.ilike.%${sq}%`);
            orConditions.push(`display_name.ilike.%${sq}%`);
        });

        // Process AI terms to ensure no commas sneak into the .or() query strings
        // Comma inside an .or() value breaks the PostgREST parser unless wrapped in double quotes
        searchTerms.forEach(term => {
            // Split any term by comma just in case the AI returned a comma-separated string as a single array item
            term.split(',').forEach(subTerm => {
                const cleanTerm = subTerm.toLowerCase().trim();
                if (cleanTerm && !searchQueries.includes(cleanTerm)) {
                    orConditions.push(`name.ilike.%${cleanTerm}%`);
                }
            });
        });

        let dbProducts: any[] = [];
        let dbErr: any = null;

        const resSearch = await serverSupabase
            .from('products')
            .select('*, pricing_model_prices(price)')
            .eq('is_active', true)
            .eq('show_on_web', true)
            .eq('pricing_model_prices.model_id', pricingModelId)
            .or(orConditions.join(','))
            .limit(100);

        if (resSearch.error) {
            console.error("Search query failed, running fallback:", resSearch.error.message);
            const resFallback = await serverSupabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .eq('show_on_web', true)
                .or(orConditions.join(','))
                .limit(100);
            dbProducts = resFallback.data || [];
            dbErr = resFallback.error;
        } else {
            dbProducts = resSearch.data || [];
        }

        console.log("DEBUG SEARCH:", { q, searchQueries, searchTerms, orConditionsLen: orConditions.length, dbErr: dbErr?.message, dbCount: dbProducts?.length });

        const foundProducts = applyNicknames(dbProducts || []);

        if (foundProducts.length === 0 && suggestedCatCode) {
            let catProducts: any[] = [];
            const resCat = await serverSupabase
                .from('products')
                .select('*, pricing_model_prices(price)')
                .eq('is_active', true)
                .eq('show_on_web', true)
                .eq('pricing_model_prices.model_id', pricingModelId)
                .eq('category', suggestedCatCode)
                .limit(40);

            if (resCat.error) {
                console.error("Cat query failed, running fallback:", resCat.error.message);
                const resCatFallback = await serverSupabase
                    .from('products')
                    .select('*')
                    .eq('is_active', true)
                    .eq('show_on_web', true)
                    .eq('category', suggestedCatCode)
                    .limit(40);
                catProducts = resCatFallback.data || [];
            } else {
                catProducts = resCat.data || [];
            }
            
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
            
            <ProductGridClient 
                products={rawProducts} 
                noProductsText={t.noProducts || 'No encontramos productos con ese nombre.'} 
            />
        </div>
    );
}
