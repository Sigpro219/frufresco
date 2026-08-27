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
import { resolvePricingModelId, CLIENTES_HOGAR_ID } from '../lib/pricingUtils';

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

    let pricingModelId = CLIENTES_HOGAR_ID;
    let agreementItems: any[] = [];
    let hasActiveAgreement = false;

    const campaignMap = new Map<string, { value: number; type: string; name: string }>();

    if (userId) {
        const { data: profile } = await serverSupabase
            .from('profiles')
            .select('id, role, profile_type, company_name, pricing_model_id, parent_id, parent:parent_id(pricing_model_id)')
            .eq('id', userId)
            .single();
        pricingModelId = resolvePricingModelId(profile);

        // Check if this client (or their matrix parent) has an active agreement quote
        const effectiveClientId = profile?.parent_id || userId;
        const { data: activeAgreement } = await serverSupabase
            .from('quotes')
            .select('id, start_date, valid_until')
            .eq('client_id', effectiveClientId)
            .eq('status', 'agreement')
            .maybeSingle();

        if (activeAgreement) {
            const todayStr = new Date().toISOString().split('T')[0];
            const start = activeAgreement.start_date?.split('T')[0];
            const end = activeAgreement.valid_until?.split('T')[0];
            let isVigente = true;
            if (start && start > todayStr) isVigente = false;
            if (end && end < todayStr) isVigente = false;

            if (isVigente) {
                hasActiveAgreement = true;
                const { data: qItems } = await serverSupabase
                    .from('quote_items')
                    .select('product_id, unit_price')
                    .eq('quote_id', activeAgreement.id);
                if (qItems) {
                    agreementItems = qItems;
                }
            }
        }

        // Check for active campaigns targeting this client
        const { data: targetCampaigns } = await serverSupabase
            .from('campaign_targets')
            .select('campaign_id')
            .eq('profile_id', effectiveClientId);

        if (targetCampaigns && targetCampaigns.length > 0) {
            const campIds = targetCampaigns.map((tc: any) => tc.campaign_id);
            const nowIso = new Date().toISOString();
            const { data: activeCamps } = await serverSupabase
                .from('commercial_campaigns')
                .select('*')
                .in('id', campIds)
                .eq('status', 'active')
                .lte('start_date', nowIso)
                .gte('end_date', nowIso);

            if (activeCamps && activeCamps.length > 0) {
                const activeCampIds = activeCamps.map((c: any) => c.id);
                const { data: items } = await serverSupabase
                    .from('campaign_items')
                    .select('campaign_id, product_id, adjustment_value')
                    .in('campaign_id', activeCampIds);

                items?.forEach((item: any) => {
                    const camp = activeCamps.find((c: any) => c.id === item.campaign_id);
                    if (camp) {
                        campaignMap.set(item.product_id, {
                            value: item.adjustment_value,
                            type: camp.type,
                            name: camp.name
                        });
                    }
                });
            }
        }
    }

    // 1. Data Fetching for the Grid (Optimized with Cache)
    const [
        allVisibleRaw,
        translationCache
    ] = await Promise.all([
        getVisibleProducts(pricingModelId),
        locale === 'en' ? getTranslationCache() : Promise.resolve({})
    ]);

    const applyCommercialPrices = (plist: any[]) => {
        const agreementPriceMap = new Map(agreementItems.map(item => [item.product_id, item.unit_price]));
        return plist.map(p => {
            const agreementPrice = agreementPriceMap.get(p.id);
            const basePrice = agreementPrice !== undefined 
                ? agreementPrice 
                : (p.pricing_model_prices?.[0]?.price ?? p.base_price ?? 0);

            const campaignAdj = campaignMap.get(p.id);
            let finalPrice = basePrice;
            let campaignInfo: any = null;

            if (campaignAdj) {
                if (campaignAdj.type === 'fixed_price') {
                    finalPrice = campaignAdj.value;
                } else if (campaignAdj.type === 'margin_adjustment') {
                    finalPrice = basePrice * (1 + campaignAdj.value / 100);
                }
                campaignInfo = {
                    originalPrice: basePrice,
                    campaignName: campaignAdj.name,
                    adjustmentValue: campaignAdj.value,
                    type: campaignAdj.type
                };
            }

            return {
                ...p,
                pricing_model_prices: [
                    {
                        price: finalPrice
                    }
                ],
                campaign_info: campaignInfo
            };
        });
    };

    const allVisible = applyCommercialPrices(allVisibleRaw);

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
            (p.keywords && p.keywords.toLowerCase().includes(sq)) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(sq)))
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
            orConditions.push(`keywords.ilike.%${sq}%`);
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

        const dbProductsWithPrices = applyCommercialPrices(dbProducts || []);
        const foundProducts = applyNicknames(dbProductsWithPrices);

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
            const catProductsWithPrices = applyCommercialPrices(catProducts || []);
            rawProducts = applyNicknames(catProductsWithPrices);
            fallbackCategoryName = CATEGORY_MAP[suggestedCatCode] || suggestedCatCode;
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

    // Sort products alphabetically (A-Z) by display_name or name
    rawProducts.sort((a, b) => {
        const nameA = (a.display_name || a.name || '').trim();
        const nameB = (b.display_name || b.name || '').trim();
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base', numeric: true });
    });

    // Recipe banner detection
    const RECIPE_TITLES: Record<string, { name: string; emoji: string }> = {
        'ajiaco': { name: 'Ajiaco Santafereño', emoji: '🥣' },
        'sancocho': { name: 'Sancocho Criollo', emoji: '🍲' },
        'bandeja paisa': { name: 'Bandeja Paisa', emoji: '🍛' },
        'mondongo': { name: 'Mondongo Tradicional', emoji: '🥘' },
        'mute': { name: 'Mute Santandereano', emoji: '🍲' },
        'tamal': { name: 'Tamal Tolimense', emoji: '🫔' },
        'arroz con pollo': { name: 'Arroz con Pollo', emoji: '🍗' }
    };
    const matchedRecipe = q ? RECIPE_TITLES[q.toLowerCase().trim()] : null;

    return (
        <div style={{ position: 'relative' }}>
            {matchedRecipe && (
                <div style={{
                    backgroundColor: '#F0FDF4',
                    border: '1.5px solid #10B981',
                    borderRadius: '16px',
                    padding: '0.9rem 1.2rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.6rem' }}>{matchedRecipe.emoji}</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#065F46' }}>
                                Ingredientes Frescos para {matchedRecipe.name}
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#047857' }}>
                                Selecciona los ingredientes y cantidades para tu preparación casera.
                            </p>
                        </div>
                    </div>
                    <Link 
                        href="/#catalog"
                        scroll={false}
                        style={{
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            color: '#065F46',
                            backgroundColor: '#FFFFFF',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #A7F3D0',
                            textDecoration: 'none'
                        }}
                    >
                        Ver todo el catálogo
                    </Link>
                </div>
            )}

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
